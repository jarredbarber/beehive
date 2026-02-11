# Coding Workflow — Overseer Context

## Workflow Roles
- **Planning agent**: `pm` — backlog grooming, task creation, verification
- **Design agent**: `design` — task decomposition, architecture decisions
- When backlog is empty: `bh create -t "Backlog review: no open tasks" -r pm -p 0`
- When task needs decomposition: `bh create -t "Decompose: [failed task]" -r design -p 1`

## Health Metrics
- **Tests**: Check recent task logs for test results. Do NOT run `npm test` yourself.
- **Build**: Check logs for build status.
- **Task throughput**: Tasks closed since last heartbeat.

## Progress Signals
- Tasks moving open → in_progress → closed
- Recent git commits from worker
- Test pass rate stable or improving

## Failure Patterns
- **Repeated test failures**: Same task, same test → close, create design task to decompose
- **Stale in_progress**: No activity for multiple heartbeats → recover
- **Scope creep**: Agent refactoring unrelated code → reopen with surgical description
- **Role gaps**: Task needs expertise the assigned role doesn't have → reassign
