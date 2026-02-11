# bh serve: Task Coordination Server

## Overview

`bh serve` exposes tm's task backlog as an HTTP API. Any agent that can make HTTP calls (or shell out to `curl` / `bh`) can claim tasks, report results, and coordinate with other agents — no custom client or protocol required.

This replaces beehive's approach (GitHub Issues as task queue) with a proper coordination server. GitHub remains the code collaboration layer (branches, PRs, pushes) but is no longer the source of truth for task state.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Agent A     │     │  Agent B     │     │  Agent C     │
│  (Claude)    │     │  (Gemini)    │     │  (any)       │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │ HTTP / CLI         │ HTTP / CLI         │ HTTP / CLI
       └────────────┬───────┴────────────────────┘
                    │
              ┌─────┴──────┐
              │  bh serve   │
              │  (Fastify)  │
              ├─────────────┤
              │  ~/.bh/data/ │  ← server-local, NOT in git
              │  mutex/lock  │  ← atomic operations
              └──────┬──────┘
                     │
              ┌──────┴──────┐
              │   git / GH   │  ← code only
              │  (optional)  │
              └─────────────┘
```

### What Lives Where

```
repo/
  .bh/config.yaml        ← checked into git (project settings, workflow, models)
  src/
  ...

~/.bh/data/
  erdos-728/             ← server-local state, never in git
    backlog.json
    logs/
    worker.pid
    poke.md
  erdos-1094/
    backlog.json
    logs/
    ...
```

| File | Location | In git? | Why |
|------|----------|---------|-----|
| `config.yaml` | `.bh/config.yaml` (repo) | **Yes** | Project config shared across clones |
| `backlog.json` | `~/.bh/data/<project>/` | **No** | Task state owned by server |
| `logs/` | `~/.bh/data/<project>/` | **No** | Worker/overseer logs, machine-local |
| `worker.pid` | `~/.bh/data/<project>/` | **No** | Process management artifact |
| `poke.md` | `~/.bh/data/<project>/` | **No** | Transient overseer input |

The repo stays clean — only code, proofs, and project config. No merge conflicts on task state. No pulling someone else's log files.

The project is identified by the `prefix` field in `.bh/config.yaml` (or derived from the directory name, as today). The server maps prefix → data directory.

## Two Interfaces, One Backend

| Interface | For | How |
|-----------|-----|-----|
| REST API | Agents, scripts, curl, webhooks | `bh serve --port 3847` |
| CLI | Humans, shell-capable agents | `bh claim <id>` |

Both hit the same `TaskManager` / `TaskStorage`. When a server is running, the CLI talks to it. Without a server, the CLI falls back to direct file access (solo mode).

```bash
# Server running → CLI proxies through it
export BH_SERVER=http://localhost:3847
bh list          # hits REST API

# No server → CLI reads ~/.bh/data/<project>/backlog.json directly
unset BH_SERVER
bh list          # direct file access (current behavior, relocated)
```

## REST API

```
GET    /tasks                     # list tasks (?status=open&role=formalize)
GET    /tasks/next?role=formalize  # highest-priority claimable task for role
POST   /tasks                     # create task
GET    /tasks/:id                 # get task details
PATCH  /tasks/:id                 # update metadata (status, priority, description)
POST   /tasks/:id/claim           # atomic claim → 409 if already claimed
POST   /tasks/:id/complete        # { summary, details? }
POST   /tasks/:id/fail            # { error, details? }
POST   /tasks/:id/block           # { reason }
POST   /tasks/:id/reopen          # reset to open
GET    /tasks/:id/log             # previous attempt log
POST   /tasks/:id/dep             # { add?: string[], remove?: string[] }
GET    /context                   # project context (PROBLEM.md, memory.md)
GET    /context/:role             # + role-specific workflow prompt
GET    /git                       # repo info (remote, strategy, base branch)
```

That's the whole API. 15 endpoints wrapping operations `bh` can already do.

## Implementation

Two deployment options, same API surface:

### Option A: Local (Fastify)

For solo use or same-machine multi-agent. Task state in `~/.bh/data/<project>/`.

```bash
bh serve --port 3847
```

### Option B: Cloudflare Workers + D1 (Recommended for multi-machine)

Globally available, zero ops, proper database. Agents anywhere can coordinate through one URL.

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Agent A   │  │ Agent B   │  │ Agent C   │
│ (home PC) │  │ (CI)      │  │ (colab)   │
└─────┬─────┘  └─────┬─────┘  └─────┬─────┘
      │ HTTPS         │ HTTPS        │ HTTPS
      └───────┬───────┴──────────────┘
              │
    ┌─────────┴──────────┐
    │  tm.example.com     │
    │  (Cloudflare Worker) │
    ├─────────────────────┤
    │  D1 (SQLite)        │  ← tasks, state
    │  R2 (optional)      │  ← log file storage
    └─────────────────────┘
```

D1 gives real transactions — atomic claims without mutex hacks. No file locking, no `backlog.json` corruption risk.

```sql
-- D1 schema
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  description TEXT,
  role TEXT,
  state TEXT DEFAULT 'open',  -- open, in_progress, closed, failed, blocked, deferred
  priority INTEGER DEFAULT 2,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  claimed_by TEXT,            -- agent identifier
  summary TEXT,               -- completion/failure summary
  details TEXT,
  status TEXT,                -- progress status text
  session_id TEXT,
  test_command TEXT
);

CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL,
  depends_on TEXT NOT NULL,
  PRIMARY KEY (task_id, depends_on)
);

CREATE TABLE task_logs (
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  content TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, attempt)
);

CREATE INDEX idx_tasks_project_state ON tasks(project, state);
CREATE INDEX idx_tasks_project_role ON tasks(project, role);
```

Atomic claim is just a conditional UPDATE:

```sql
UPDATE tasks SET state = 'in_progress', claimed_by = ?, updated_at = datetime('now')
WHERE id = ? AND project = ? AND state = 'open'
RETURNING *;
-- Returns 0 rows if already claimed → 409
```

No mutex needed. D1 handles it.

### Shared Handler Layer

Both deployments share the same handler logic. Only the storage backend differs:

```typescript
// Shared interface
interface TaskStore {
  listTasks(project: string, filters?: { status?: string; role?: string }): Promise<Task[]>;
  getTask(project: string, id: string): Promise<Task | null>;
  claimTask(project: string, id: string, agent?: string): Promise<Task | 'not_found' | 'conflict'>;
  completeTask(project: string, id: string, summary: string, details?: string): Promise<Task>;
  failTask(project: string, id: string, error: string, details?: string): Promise<Task>;
  createTask(project: string, task: CreateTaskInput): Promise<Task>;
  // ...
}

// Local implementation: reads/writes ~/.bh/data/<project>/backlog.json with mutex
class LocalTaskStore implements TaskStore { ... }

// D1 implementation: SQL queries against Cloudflare D1
class D1TaskStore implements TaskStore { ... }
```

Route handlers are identical regardless of backend:

```typescript
// Works with both Fastify (local) and Cloudflare Workers (Hono/itty-router)
function handleClaimTask(store: TaskStore, project: string, taskId: string, agent?: string) {
  const result = await store.claimTask(project, taskId, agent);
  if (result === 'not_found') return { status: 404, body: { error: 'not_found' } };
  if (result === 'conflict') return { status: 409, body: { error: 'already_claimed' } };
  return { status: 200, body: { task: result } };
}
```

### Auth

Cloudflare deployment needs auth. Simple bearer token per project:

```bash
# CLI sends token with every request
export BH_SERVER=https://tm.example.com
export BH_TOKEN=<project-token>
bh list
```

Token stored in D1 or as a Worker secret. One token per project. Generate with `bh auth create-token --project erdos-728`.
```

## Agent Integration Patterns

### Shell-capable agent (simplest)

Agent uses `bh` CLI directly — no server needed for single-agent:

```bash
TASK=$(tm next --role formalize --json | jq -r '.id')
bh claim $TASK
# ... do work ...
bh close $TASK -m "Proved lemma, 0 sorrys"
```

### HTTP-capable agent

Agent calls REST API — works for multi-agent, remote agents, or agents without shell:

```bash
# In agent's system prompt: "Use the task API at http://localhost:3847"
curl -s http://localhost:3847/tasks/next?role=formalize
curl -X POST http://localhost:3847/tasks/erdos728-abc/claim
# ... do work ...
curl -X POST http://localhost:3847/tasks/erdos728-abc/complete \
  -H 'Content-Type: application/json' \
  -d '{"summary": "Proved lemma, 0 sorrys"}'
```

### Hybrid (recommended for production)

`bh worker` runs the main loop (overseer, git sync, notifications). Additional agents connect via REST for parallelism:

```bash
# Terminal 1: Main worker with overseer
bh worker start

# Terminal 2: Coordination server for additional agents
bh serve --port 3847

# Terminal 3+: Additional agents connect via REST
pi --system-prompt "You are a formalize agent. Use http://localhost:3847 for task coordination..."
```

## Git Coordination

Git config lives in `.bh/config.yaml` (already exists):

```yaml
git:
  strategy: branch
  baseBranch: main
github:
  enabled: true
  repo: jarredbarber/erdos-728
```

`GET /git` exposes this to agents. Agents handle their own git operations (branch, commit, push, PR) using standard tools. Convention: branch name is `task/<task-id>`.

## What This Replaces

| Beehive (bh) | bh serve |
|---|---|
| GitHub Issues as task store | `backlog.json` via REST API |
| `bh claim` (gh CLI wrapper) | `POST /tasks/:id/claim` or `bh claim` |
| `bh submit` (creates PR) | Agent does git + `POST /tasks/:id/complete` |
| `bh plan apply` (YAML → Issues) | `POST /tasks` |
| SKILL.md teaches protocol | API is self-describing |
| Requires `gh` CLI + auth | Requires `curl` (or nothing, with CLI) |
| GitHub rate limits | No rate limits |

## Migration Path

1. **Define `TaskStore` interface**: Abstract over local file and D1 backends
2. **Relocate local data**: Move `backlog.json`, `logs/`, etc. from `.bh/` (repo) to `~/.bh/data/<project>/`. Keep only `config.yaml` in repo
3. **Implement REST routes**: Shared handlers, test with curl locally (Fastify)
4. **Add `bh serve` command**: Local mode with `--port` flag
5. **Add `BH_SERVER` / `BH_TOKEN` detection to CLI**: If set, proxy commands through REST
6. **Implement D1 backend**: `D1TaskStore`, Cloudflare Worker, deploy
7. **Add `bh init --cloud`**: Sets `BH_SERVER` in `.bh/config.yaml`, creates project + token on the server
8. **Deprecate beehive**
9. **Optional**: `bh import` to migrate existing `backlog.json` into D1

## Non-Goals

- **Agent lifecycle management**: bh doesn't spawn or monitor agents. Use PM2, Docker, systemd.
- **File synchronization**: Agents read/write files directly. bh doesn't proxy file access.
- **Model selection**: Agents come pre-configured. bh doesn't care what model they use.
- **MCP protocol**: If MCP becomes universal, add it as a thin adapter later. REST is enough today.

## Open Questions

1. **Stale task recovery**: If an agent crashes mid-task, the task stays `in_progress`. D1 makes this easier — `UPDATE tasks SET state = 'open' WHERE state = 'in_progress' AND updated_at < datetime('now', '-60 minutes')` as a cron trigger.

2. **Notifications**: Currently `notify_cmd` runs a shell command (machine-local). Cloud deployment needs a webhook approach — ntfy.sh URL, Telegram bot, or just poll. Could add a `POST /projects/:id/webhook` config.

3. **Existing project migration**: `bh import` reads local `backlog.json` and inserts into D1. One-time operation per project.

4. **Log storage**: Worker logs are valuable for anthropology/debugging. Options for cloud: store in D1 `task_logs` table (small logs), R2 bucket (large logs), or just keep logs local to the machine that ran the agent (simplest — logs are about what happened on *that* machine).

5. **Multi-project**: D1 naturally supports multiple projects in one database (everything keyed by `project`). One Worker deployment serves all projects. One token per project for isolation.

6. **Workflow prompts**: Currently loaded from `workflows/<name>/*.md` on disk. Cloud agents need these too. Options: serve from repo (agent clones repo anyway), serve via `GET /context/:role`, or store in D1. Leaning toward "agent clones repo" — they need the codebase to do work anyway.
