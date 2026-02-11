# Beehive: Distributed Task Coordination for AI Agents

## Overview

Beehive coordinates AI agents ("bees") working on shared projects. Bees anywhere — your machine, CI, a collaborator's laptop — claim tasks, work on git branches, submit PRs, and report results. The server ("hive") is the source of truth for task state. The DAG only advances when PRs actually merge.

GitHub handles code (branches, PRs). The hive handles tasks. The PR is the trust boundary between them.

## Architecture

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Bee A    │  │  Bee B    │  │  Bee C    │
│ (home PC) │  │ (CI)      │  │ (colab)   │
└─────┬─────┘  └─────┬─────┘  └─────┬─────┘
      │ HTTPS         │ HTTPS        │ HTTPS
      └───────┬───────┴──────────────┘
              │
    ┌─────────┴──────────┐
    │  hive               │
    │  (Cloudflare Worker) │
    ├─────────────────────┤
    │  D1 (SQLite)        │  ← tasks, submissions, state
    │                     │
    └─────────────────────┘
              │
        GitHub webhooks
              │
    ┌─────────┴──────────┐
    │  GitHub repo(s)     │  ← code only (branches, PRs)
    └─────────────────────┘
```

### Separation of Concerns

| Concern | Mechanism | Source of truth |
|---------|-----------|-----------------|
| Task state | Hive (REST API + D1) | D1 database |
| Code changes | Git branches + PRs | GitHub repo |
| Trust / gating | PR review (bee or human) | Merge event |
| Project config | `.bh/config.yaml` in repo | Git |

### What Lives Where

```
repo/
  .bh/config.yaml         ← checked into git (project settings, workflow, models)
  src/                     ← code
  ...

hive (D1):
  tasks                    ← task state, claims, results
  submissions              ← held metadata (pending PR merge)
  task_dependencies        ← DAG edges
  task_logs                ← agent session logs
```

The repo stays clean — only code, proofs, and project config. No task state in git. No merge conflicts on backlog files.

## Task Lifecycle

### Work vs Review

Determined by role. Most roles (formalize, explore, code, etc.) produce code → submit PR → `pending_review`. The `pr_review` role is pure judgment — reads a diff, returns a verdict. No PR, no review-of-review. No infinite recursion.

### State Machine

```
open ──→ in_progress ──→ pending_review ──→ closed
  ▲           │               │
  │           │               │ (reject)
  │           ▼               │
  │       failed / blocked    │
  │                           │
  └───────────────────────────┘  (→ open, bee retries)
```

States: `open`, `in_progress`, `pending_review`, `closed`, `failed`, `blocked`. No `rejected` state — rejection returns to `open`.

### Full Flow

```
1. Bee claims task
   POST /tasks/:id/claim
   State: open → in_progress

2. Bee works on a branch
   git checkout -b task/<task-id>
   # ... write code/proofs, commit ...
   git push -u origin task/<task-id>

3. Bee opens PR on GitHub

4. Bee submits to hive
   POST /tasks/:id/submit
   {
     pr_url: "https://github.com/.../pull/42",
     summary: "Proved lemma, 0 sorrys",
     follow_up_tasks: [
       { title: "Verify no axiom leaks", role: "verify", priority: 1 }
     ],
     log: "... agent session log ..."
   }
   State: in_progress → pending_review
   Metadata stored but NOT executed

5. Hive auto-creates a review task
   A reviewer bee (or human) inspects the PR

6a. Approve
    POST /tasks/:id/approve
    → Hive merges PR (or waits for merge webhook)
    → Executes submission:
      - State: pending_review → closed
      - Creates follow-up tasks
      - Unblocks dependents
      - Stores log

6b. Reject
    POST /tasks/:id/reject { reason: "2 sorrys remain" }
    → Hive comments on PR with reason
    → State: pending_review → open
    → Follow-up tasks never created
```

### Why PR as Trust Boundary

- **DAG only changes on merge.** No phantom tasks from unreviewed work
- **Rejection → clean rollback.** Task reopens, follow-ups never created
- **Submission is a proposal, merge is the commit.** Metadata held until code lands
- **Human stays in the loop** via PR review. Or auto-approve for trusted workflows
- **Review tasks don't recurse.** Verdict is terminal

### Review Tasks

When a work task enters `pending_review`, the hive creates:

```json
{
  "title": "Review: Proved lemma (erdos728-abc)",
  "role": "pr_review",
  "metadata": {
    "reviews_task": "erdos728-abc",
    "pr_url": "https://github.com/.../pull/42"
  }
}
```

The reviewer bee:
1. Claims the review task
2. Checks out the PR, runs validation (build, tests, proof checks)
3. Calls `approve` or `reject` on the **original work task**
4. Review task auto-closes

## Two Interfaces

| Interface | For | How |
|-----------|-----|-----|
| REST API | Bees, scripts, curl, webhooks | `bh serve` or Cloudflare Worker |
| CLI | Humans, shell-capable bees | `bh claim <id>` |

The CLI talks to the hive over HTTP (`BH_SERVER` env var). For local-only use, `bh serve` runs a Fastify server on localhost.

## REST API

```
# Projects                                Auth
POST   /projects                         # admin — register project
GET    /projects/:name                   # bee   — get project config

# Task CRUD
GET    /tasks                            # bee   — list (?status, ?role, ?project)
POST   /tasks                            # admin — create task
GET    /tasks/:id                        # bee   — get task details
PATCH  /tasks/:id                        # admin — update metadata
DELETE /tasks/:id                        # admin — delete task

# Bee lifecycle
POST   /tasks/next                       # bee   — get + claim next task
POST   /tasks/:id/claim                  # bee   — claim specific task
PATCH  /tasks/:id/status                 # bee   — progress update { status: "working on X" }
POST   /tasks/:id/submit                 # bee   — submit PR + metadata
POST   /tasks/:id/fail                   # bee   — mark failed
POST   /tasks/:id/block                  # bee   — mark blocked

# Admin lifecycle
POST   /tasks/:id/approve               # admin — execute submission
POST   /tasks/:id/reject                # admin — reject, reopen task
POST   /tasks/:id/reopen                # admin — reset to open
POST   /tasks/:id/dep                   # admin — modify DAG edges

# Context
GET    /tasks/:id/log                    # bee   — attempt logs
GET    /context/:role                    # bee   — workflow prompt

# Keys
POST   /keys                             # admin — create key
GET    /keys                             # admin — list keys
DELETE /keys/:hash                       # admin — revoke key

# Bulk
GET    /projects/:name/dump              # admin — full project as JSON (tasks + deps, no logs)
POST   /projects/:name/load             # admin — import JSON (merge or replace)

# Webhooks
POST   /webhooks/github                  # signed — PR merge events
```

## Deployment

### Local (Fastify)

For solo use or same-machine multi-agent:

```bash
bh serve --port 3847
```

### Cloudflare Workers + D1 (recommended)

Globally available, zero ops, proper database:

```bash
# Deploy once
cd beehive/worker
wrangler deploy
```

### D1 Schema

```sql
CREATE TABLE projects (
  name TEXT PRIMARY KEY,
  repo TEXT,                   -- e.g. "jarredbarber/erdos-728"
  config TEXT,                 -- full .bh/config.yaml as text
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  description TEXT,
  role TEXT,
  state TEXT DEFAULT 'open',   -- open, in_progress, pending_review, closed, failed, blocked
  priority INTEGER DEFAULT 2,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  claimed_by TEXT,             -- bee identifier
  summary TEXT,
  details TEXT,
  status TEXT,                 -- progress text
  pr_url TEXT,
  parent_task TEXT,            -- task that spawned this (null for manual/root tasks)
  reviews_task TEXT            -- pr_review tasks: which work task
);

CREATE TABLE submissions (
  task_id TEXT PRIMARY KEY,
  pr_url TEXT NOT NULL,
  summary TEXT,
  details TEXT,
  follow_up_tasks TEXT,        -- JSON array
  log TEXT,
  submitted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL,
  depends_on TEXT NOT NULL,
  PRIMARY KEY (task_id, depends_on)
);

CREATE TABLE task_logs (
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  content BLOB,               -- gzipped text (5-10x compression on agent logs)
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, attempt)
);

CREATE INDEX idx_tasks_project_state ON tasks(project, state);
CREATE INDEX idx_tasks_project_role ON tasks(project, role);
```

Atomic claim:

```sql
UPDATE tasks SET state = 'in_progress', claimed_by = ?, updated_at = datetime('now')
WHERE id = ? AND project = ? AND state = 'open'
RETURNING *;
-- 0 rows = already claimed → 409
```

### Task Assignment

`POST /tasks/next` is claim + assignment in one call. The bee sends its capabilities, the hive picks the best match:

```json
// Request
{
  "project": "erdos-728",
  "bee": "bee-alpha",
  "models": ["claude-opus-4-6", "claude-sonnet-4-5"],
  "roles": ["formalize", "explore"]    // optional: roles this bee can handle
}

// Response (task already claimed for this bee)
{
  "task": { "id": "erdos728-abc", "role": "formalize", ... },
  "model": "claude-opus-4-6",         // hive picks model from bee's list
  "prompt": "..."                      // system prompt for the role
}

// Response (no work available)
null
```

The hive matches based on:
1. **Role**: task's role must be in bee's `roles` list (or bee handles all roles if omitted)
2. **Model tier**: project config maps roles to model tiers (heavy/medium/light). Hive picks the best available model from the bee's list that satisfies the tier
3. **Priority**: highest priority unblocked task wins
4. **Dependencies**: only tasks with all deps closed are eligible

### Auth

Two levels of API key, both stored in D1:

| Key type | Can do | Issued to |
|----------|--------|-----------|
| **admin** | Everything: create/delete projects, manage keys, modify DAG, approve/reject | Project owner |
| **bee** | `next`, `submit`, `fail`, `block`, read endpoints | Individual bees |

```sql
CREATE TABLE api_keys (
  key_hash TEXT PRIMARY KEY,   -- SHA-256 of the key (never store plaintext)
  project TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'admin' | 'bee'
  label TEXT,                   -- e.g. "jarred-laptop", "ci-runner-1"
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);
```

```bash
# Admin generates keys
bh keys create --project erdos-728 --role admin --label "jarred"
# → bh_ak_...  (admin key, starts with bh_ak_)

bh keys create --project erdos-728 --role bee --label "ci-runner"
# → bh_bk_...  (bee key, starts with bh_bk_)

bh keys list --project erdos-728
bh keys revoke bh_bk_...
```

Bees authenticate with their key:

```bash
export BH_SERVER=https://hive.example.com
export BH_KEY=bh_bk_...
bh next --project erdos-728 --models claude-opus-4-6
```

Every request includes `Authorization: Bearer <key>`. The hive hashes it, looks up in `api_keys`, checks the role has permission for the endpoint, and records `last_used_at`.

## Project Registration

```bash
bh init --server https://hive.example.com --repo jarredbarber/erdos-728
```

Creates a project entry in the hive. Returns the first admin key — this is the bootstrap. Config (workflow name, model preferences) stored in `projects` table.

```
✅ Project erdos-728 created
   Admin key: bh_ak_...
   Save this — it cannot be retrieved later.
```

The `init` endpoint is unauthenticated (creating a new project doesn't require a key). After that, all operations require a key scoped to that project.

Workflow prompts ship with the beehive package — they're bundled in the Worker deployment. No upload, no sync. `GET /context/formalize` reads from the deployed code, not the database.

## Task IDs

Generated by the hive. Short, prefixed with project name:

```
erdos728-a1b2
erdos728-c3d4
```

Callers never supply IDs. `POST /tasks` returns the generated ID. This avoids collisions when multiple bees or admins create tasks concurrently.

## Shared Handler Layer

Both local (Fastify) and cloud (Worker) deployments share the same logic. Only the storage backend differs:

```typescript
interface TaskStore {
  listTasks(project: string, filters?: { status?: string; role?: string }): Promise<Task[]>;
  getTask(project: string, id: string): Promise<Task | null>;
  createTask(project: string, task: CreateTaskInput): Promise<Task>;
  claimTask(project: string, id: string, bee?: string): Promise<Task | 'not_found' | 'conflict'>;
  submitTask(project: string, id: string, submission: Submission): Promise<Task | 'not_found'>;
  approveTask(project: string, id: string): Promise<Task | 'not_found'>;
  rejectTask(project: string, id: string, reason: string): Promise<Task | 'not_found'>;
  failTask(project: string, id: string, error: string, details?: string): Promise<Task>;
  reopenTask(project: string, id: string): Promise<Task | 'not_found'>;
}

interface Submission {
  pr_url: string;
  summary: string;
  details?: string;
  follow_up_tasks?: CreateTaskInput[];
  log?: string;
}

class LocalTaskStore implements TaskStore { ... }  // JSON file + mutex
class D1TaskStore implements TaskStore { ... }     // Cloudflare D1
```

`approveTask` is where the magic happens — executes the held submission:

```typescript
async approveTask(project: string, id: string): Promise<Task | 'not_found'> {
  // In a transaction:
  // 1. task.state = 'closed'
  // 2. Read submission metadata
  // 3. Create follow_up_tasks with parent_task = id
  // 4. Unblock dependent tasks
  // 5. Delete submission (executed)
  // 6. Auto-close the pr_review task
}
```

## Bee Patterns

### Work bee (CLI)

```bash
# Bee announces capabilities, hive assigns + claims in one step
RESULT=$(bh next --project erdos-728 --models claude-opus-4-6,claude-sonnet-4-5 --json)
TASK=$(echo $RESULT | jq -r '.task.id')
git checkout -b task/$TASK

# ... work ...

git push -u origin task/$TASK
PR_URL=$(gh pr create --title "$TASK: Proved lemma" | tail -1)
bh submit $TASK --pr "$PR_URL" --summary "0 sorrys" \
  --follow-up "Verify axioms:verify:1"
```

### Reviewer bee

```bash
REVIEW=$(bh next --project erdos-728 --roles pr_review --json | jq -r '.task.id')
ORIGINAL=$(bh show $REVIEW --json | jq -r '.metadata.reviews_task')
PR_URL=$(bh show $REVIEW --json | jq -r '.metadata.pr_url')

gh pr checkout "$PR_URL"
lake build  # or: npm test, etc.

bh approve $ORIGINAL
# or: bh reject $ORIGINAL --reason "2 sorrys in SkewedCase.lean"
```

### HTTP bee (no CLI)

```bash
# Get + claim in one call
curl -X POST https://hive.example.com/tasks/next \
  -H "Authorization: Bearer $BH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"project":"erdos-728","bee":"bee-beta","models":["gemini-3-flash"]}'

# ... work, open PR ...

curl -X POST https://hive.example.com/tasks/erdos728-abc/submit \
  -H "Authorization: Bearer $BH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "pr_url": "https://github.com/.../pull/42",
    "summary": "0 sorrys",
    "follow_up_tasks": [
      {"title": "Verify axioms", "role": "verify", "priority": 1}
    ]
  }'
```

## Build Order

1. Define `TaskStore` interface
2. Add `submissions` table / data structure + `pending_review` state
3. Implement pr_review task auto-creation on submit
4. REST routes (Fastify), test with curl
5. `bh serve` command (local mode)
6. D1 backend (`D1TaskStore`), deploy as Cloudflare Worker
7. Auth (bearer token per project)
8. GitHub webhook handler (PR merge → auto-execute pending submissions)
9. CLI updates (`bh claim`, `bh submit`, `bh approve`, `bh reject`)

## Bulk Operations

```bash
# Dump a project
bh dump erdos-728 > erdos-728.json

# Edit in your editor (merge tasks from multiple projects, re-ID, rewire deps)
# ...

# Load into a new or existing project
bh load erdos-all < erdos-all.json
bh load erdos-all --replace < erdos-all.json  # wipe existing tasks first
```

Dump format:

```json
{
  "project": "erdos-728",
  "tasks": [
    {
      "id": "erdos728-abc",
      "description": "Formalize carry lemma",
      "role": "formalize",
      "state": "closed",
      "priority": 2,
      "parent_task": "erdos728-xyz",
      "dependencies": ["erdos728-def"],
      "summary": "0 sorrys, 47 lines",
      "pr_url": "https://github.com/.../pull/42"
    }
  ],
  "submissions": []
}
```

No logs in the dump — they're large and rarely needed for migration. Use `GET /tasks/:id/log` individually if needed.

Use cases:
- **Merge projects**: Dump erdos-728a + 728b, combine tasks in editor, load into erdos-728-all
- **Template**: Dump a project, strip completed state, load as a fresh starting point
- **Backup/restore**: Periodic dump to git or local file
- **Bulk editing**: Easier to re-prioritize 50 tasks in JSON than 50 API calls

## Non-Goals

- **Bee lifecycle management**: The hive doesn't spawn or monitor bees. Use PM2, Docker, systemd
- **File synchronization**: Bees read/write files directly. The hive doesn't proxy file access
- **Model selection**: Bees come pre-configured. The hive doesn't care what model they use
- **MCP protocol**: REST is enough. Add MCP adapter later if it becomes universal
- **Social credit / trust scores**: Interesting but later. Work tasks need review, pr_review tasks don't. That's the whole trust model for now

## Open Questions

1. **Stale recovery**: Bee crashes mid-task → stuck `in_progress`. D1 cron: `UPDATE tasks SET state = 'open' WHERE state = 'in_progress' AND updated_at < datetime('now', '-60 minutes')`. Or explicit heartbeat endpoint

2. **Notifications**: Webhook config per project for task events (ntfy, Telegram, Slack). `POST /projects/:id/webhook` to register

3. ~~**Log storage**~~: D1 `task_logs` table, gzipped. Agent logs compress 5-10x

4. **Multi-project**: D1 naturally keys everything by `project`. One hive serves all projects

5. ~~**Workflow prompts**~~: Bundled in the worker package, served via `GET /context/:role`

6. **Auto-merge**: For trusted workflows, hive could merge the PR itself on approve (via GitHub API) instead of waiting for human merge. Flag per project or per task
