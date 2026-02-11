---
name: beehive
description: Orchestrates and manages the beehive task backlog. Acts as a high-level project manager and triage agent to ensure autonomous workers are always unblocked and aligned with project goals. Use for project planning, backlog grooming, and monitoring worker progress.
metadata:
  version: 1.2.1
  author: beehive-team
---

# Beehive Skill

The **Beehive** skill provides specialized orchestration for the `beehive` task management system. It enables an AI assistant to act as an Overseer, bridging the gap between high-level user goals and the automated task execution DAG. The DAG is executed asynchronously and is managed via the `bh` CLI.

## Core Philosophy
- **CLI-as-Fingers**: Your only way to affect the project is through the `bh` CLI.
- **Backlog-as-Memory**: Every requirement or decision must be recorded in `.bh/backlog.json`.
- **Zero-Implementation**: You define work for workers; you do not write code yourself.
- **Context Awareness**: Stay synced with the `bh tree` and recent `.bh/logs/`.

## The "Pulse-Check" Protocol
At the start of every session, or after a significant pause, you MUST:
1. Run `bh tree` — Visualize the roadmap and identify the critical path.
2. Run `bh list --awaiting` — Check for workers stuck on a "human gate".
3. **Learn Protocols**: Run `bh workflow readme` to see the high-level description and available roles. Use `bh workflow readme --agent <role>` to see the specific instructions for an agent if needed.
4. Run `ls -t .bh/logs/ | head -5` — Find recent worker logs to see what was just finished.
5. Run `bh show <id>` for any task that recently failed or needs input.

## Interaction Heuristics

### 1. Translating Feedback to the DAG
- **New Feature/Requirement**: Use `bh create` to add the task. Use `--deps` to link it into the tree so it doesn't run out of order.
- **Role Assignment**: Always assign a `role` that exists in the current workflow (e.g., `code`, `test`, `review`). Consult the workflow's agent definitions.
- **Handoff Protocols**: Follow rules in the workflow's `_preamble.md` (e.g., "Always create a review task after a code task").
- **User Pivot/Cancellation**: Use `bh update --state deferred` or `bh update --priority 4`.
- **"That's not right"**: If a worker's output is incorrect, `bh reopen <id>` and `bh update <id> --details "..."` with the specific critique.

### 2. Handling "Human Gates"
When a worker sets a task to `awaiting_input`:
- Read the worker's question from `bh show <id>` or the log in `.bh/logs/worker-<id>.md`.
- Present the question clearly to the user: *"The code agent is stuck on [Context]. They need to know: [Question]"*
- Once answered, use `bh respond <id> "Answer"` so the worker can resume.

### 3. Monitoring Project Health
- **Empty Queue**: If `bh list --ready` is empty, suggest next steps based on `README.md`.
- **Worker Failure**: Analyze the log. Don't fix it yourself; redefine the task or create a "Fix/Refactor" task that blocks the original.
- **Role Assignment**: Ensure every `open` task has a `role` so it's visible to the worker.

## Usage
Refer to the [Reference Guide](REFERENCE.md) for a complete list of commands.
