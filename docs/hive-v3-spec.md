# Hive v3: Minimal Agent Coordination Hub

**Status:** Spec for implementation  
**Replaces:** All existing Beehive code (delete everything, start fresh)

## Overview

A single Node.js HTTP server that provides agent-to-agent messaging and shared task state. That's it. No workflows, no projects, no logs, no DAGs. Coordination happens through DMs between agents. Tasks are a shared notepad.

## Data Model

### In-Memory (no persistence needed)

```
agents: Map<name, { lastSeen: timestamp }>
messages: Map<name, Array<{ sender, text, group?, timestamp }>>
```

### SQLite (one file: `hive.db`)

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  assignee TEXT,
  body TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

One table. That's the whole schema.

## API

All requests require: `Authorization: Bearer <api-key>`  
API keys are just strings in an env var: `HIVE_API_KEYS=key1,key2,key3`  
Any valid key grants full access (no admin/bee distinction).

Server binds to `0.0.0.0` on configurable port (default 3141).

### Comms

#### `POST /send`
Send a message to an agent or group.

```json
// Request
{ "target": "explore", "text": "Work on Soundness.lean", "sender": "planner" }

// Response
{ "status": "sent" }
// or for groups:
{ "status": "sent_to_group", "recipients": ["explore", "verify", "formalize"] }
```

If `target` matches a group name, broadcast to all online members except sender.

#### `GET /messages/:name`
Poll messages for an agent. Also serves as heartbeat (updates lastSeen).

```json
// Response
{ "messages": [
    { "sender": "planner", "text": "Work on Soundness.lean", "timestamp": 1707700000 }
  ]
}
```

Messages are consumed on read (cleared from queue). Max queue size: 100 messages per agent (drop oldest if exceeded).

#### `GET /agents`
List online agents.

```json
// Response
{ "agents": ["planner", "explore", "formalize", "verify"] }
```

An agent is "online" if it polled `/messages/:name` within the last 15 seconds. Configurable via `HIVE_TIMEOUT_MS` env var.

#### `POST /register`
Register an agent name and start tracking presence.

```json
// Request
{ "name": "explore" }

// Response
{ "status": "registered" }
```

### Groups

Groups are defined in a config file (`groups.json`) or env var:

```json
{
  "openlemma": ["advisor", "planner", "explore", "verify", "formalize", "librarian"]
}
```

No API for group management. Edit the file, restart the server.

### Tasks

#### `GET /tasks`
List tasks. Optional query filters.

```
GET /tasks                          → all tasks
GET /tasks?status=open              → open tasks
GET /tasks?assignee=explore         → explore's tasks
GET /tasks?status=open&assignee=explore → open tasks for explore
```

```json
// Response
{ "tasks": [
    { "id": "a1b2", "title": "Close Soundness.lean sorrys", "status": "open", 
      "assignee": "formalize", "body": "5 sorrys remaining...", 
      "created_at": 1707700000, "updated_at": 1707700000 }
  ]
}
```

#### `POST /tasks`
Create a task. Returns generated ID (random 4-char hex).

```json
// Request
{ "title": "Close Soundness.lean sorrys", "assignee": "formalize", "body": "optional details" }

// Response  
{ "id": "a1b2", "title": "Close Soundness.lean sorrys", "status": "open", 
  "assignee": "formalize", "body": "optional details",
  "created_at": 1707700000, "updated_at": 1707700000 }
```

#### `PATCH /tasks/:id`
Update any field(s). Sets `updated_at` automatically.

```json
// Request
{ "status": "done" }

// Response
{ "id": "a1b2", "title": "Close Soundness.lean sorrys", "status": "done", 
  "assignee": "formalize", "body": "optional details",
  "created_at": 1707700000, "updated_at": 1707700100 }
```

`status` is a free-form string. Suggested values: `open`, `in_progress`, `done`, `blocked`. But the server doesn't enforce these — agents can write whatever they want.

## Configuration

All via environment variables:

```bash
HIVE_PORT=3141              # Listen port
HIVE_API_KEYS=key1,key2     # Comma-separated valid API keys
HIVE_TIMEOUT_MS=15000       # Presence timeout (ms)
HIVE_DB_PATH=./hive.db      # SQLite database path
HIVE_GROUPS='{"openlemma":["advisor","planner","explore","verify","formalize","librarian"]}'
```

## What This Is NOT

- No workflows, roles, or workflow-specific prompts
- No project concept (tasks are a flat list)
- No task dependencies or DAGs
- No logs storage
- No PR/review lifecycle
- No admin/bee key distinction
- No worker loop (agents are managed externally)
- No CLI (use curl, or build one later)

## Implementation Notes

- Single `index.js` file, no build step
- Dependencies: `better-sqlite3` (or `sql.js` for zero native deps)
- Target: < 300 lines
- No framework (raw `node:http`)
- CORS headers for browser access (future dashboard)
- Graceful shutdown: close SQLite on SIGTERM

## Migration

There is no migration. Delete the existing Beehive codebase and start fresh. The only thing that carries over is the concept.

## Extension Integration

The existing `team-bridge.ts` pi extension needs one change: make the hub URL configurable instead of hardcoded `http://127.0.0.1:3141`. Everything else (remote_prompt, list_remote_agents tools) stays the same.

A new `task` tool could be added to the extension:
```
task_list    — GET /tasks
task_create  — POST /tasks  
task_update  — PATCH /tasks/:id
```

But this is optional — agents can also just use `bash` + `curl`.
