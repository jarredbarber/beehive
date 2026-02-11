# Beehive Reference Guide

This document serves as the primary technical reference for the `beehive` task management system. It details every CLI command, task property, and the architectural conventions used by both human operators and AI agents.

## CLI Command Reference

### Task Management
| Command | Description |
|---------|-------------|
| `bh create -t "title"` | Create a new task. Use `-r` for role, `-p` for priority. |
| `bh list` | List all open tasks. Use `--ready` for unblocked, `--all` for everything. |
| `bh show <id>` | Show detailed information and status for a specific task. |
| `bh tree` | Display the dependency DAG. Use `-b` for the blocked view. |
| `bh update <id>` | Update task metadata (state, priority, role, etc.). |
| `bh dep <id> <deps>` | Set task dependencies (comma-separated IDs). |
| `bh close <id>` | Mark a task as completed with an optional summary. |
| `bh reopen <id>` | Reset a task back to `open` state. |
| `bh edit <id>` | Edit the task description in the system editor. |
| `bh workflow readme` | Show the README for the current workflow. |
| `bh workflow fork <name>` | Fork a workflow for local customization. |
| `bh template list` | List available task templates. |
| `bh template show <name>` | Display the contents of a specific template. |

### Interactive & Worker
| Command | Description |
|---------|-------------|
| `bh overseer` | Launch the interactive AI orchestration shell. |
| `bh worker` | Start the autonomous execution loop. |
| `bh respond <id>` | Provide an answer to a task in `awaiting_input`. |
| `bh tail <id>` | Stream live worker logs to the console. |

## Task Properties

- **ID**: 3-character unique identifier (e.g., `tm-abc` or `abc`).
- **Title**: Brief summary of the task.
- **Description**: Detailed explanation of the work required.
- **State**: `open`, `in_progress`, `closed`, `deferred`, `failed`, `blocked`, `awaiting_input`.
- **Priority**: 0 (Critical) to 4 (Backlog).
- **Role**: The agent responsible for the task (`code`, `test`, `review`, `docs`, `design`, `pm`).
- **Size**: `small`, `medium`, `large`.
- **Type**: `task`, `bug`, `chore`.
- **Summary**: Brief outcome reported when closing a task.
- **Details**: In-depth explanation of the work performed, reported when closing.
- **Dependencies**: List of task IDs that must be closed before this task can start.

## Workflow Hierarchy
`beehive` searches for workflows and agents in this order:
1. `.bh/workflows/` (Project metadata)
2. `./workflows/` (Project root)
3. `~/.bh/workflows/` (User global)
4. `[install-dir]/workflows/` (System global)
