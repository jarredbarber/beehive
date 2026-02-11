# Coding Workflow

## Overview

The **Coding Workflow** is a multi-agent system for collaborative software development. It uses role-based agents to plan, execute, review, and improve code with clear handoff protocols and dependency tracking.

## Agents

| Agent | Type | Model | Purpose |
|-------|------|-------|---------|
| **code** | Executor | medium | Implements features and fixes bugs |
| **test** | Executor | medium | Writes comprehensive tests |
| **docs** | Executor | light | Creates and updates documentation |
| **design** | Orchestrator | heavy | Decomposes features into task DAGs; designs architecture |
| **review** | Orchestrator | heavy | Reviews code for quality, security, and correctness |
| **pm** | System Agent | heavy | Manages backlog, verifies completeness, ensures coherence |
| **overseer** | Interactive | heavy | Bridges chat with task system; manages triage and handoffs |

### Executor vs Orchestrator Roles

**Executors** focus on hands-on work:
- `code` — Implement features and fixes
- `test` — Write and maintain tests
- `docs` — Write and update documentation

**Orchestrators** plan, verify, and coordinate:
- `design` — Break down large features into executable subtasks (creates task DAGs)
- `review` — Check quality, find issues, create follow-up tasks
- `pm` — Manage backlog, verify nothing is missed, ensure project coherence

**System Agents** are prioritized above all other work:
- `pm` — System agent tasks run first to ensure governance happens before execution

### Development & Testing Safety

**CRITICAL**: When developing or testing agents, **NEVER** run `bh` commands in the project root. Always use the `sandbox/` directory to avoid polluting the real task backlog or triggering accidental autonomous actions. See `AGENTS.md` in the project root for full details.

## Quick Start

### For Humans

1. **Create a task**: `bh create -t "Implement login" -r code -p 2`
2. **View workflow**: `bh tree` to see task dependencies
3. **Run agents**: `bh worker --once` to execute one task with AI
4. **Check progress**: `bh list --ready` to see what's unblocked

### For Agents

1. **Get your task**: `bh next` shows the highest-priority unblocked task
2. **Understand scope**: Read the task title and description
3. **Do your work**: Implement, review, test, or document as needed
4. **Create follow-ups** if you discover related work:
   - Use `--deps` to explicitly chain tasks (A → B → C)
   - Use `--inherit-deps` to copy dependencies from another task
   - Follow the Standard Handoff Patterns (see below)
5. **Complete task**: Return JSON with `status`, `summary`, `details`

## Key Concepts

### Task States

```
open → in_progress → closed
  ↓          ↓
deferred   failed
  ↓          ↓
awaiting_input  blocked
```

- **open**: Ready to work on
- **in_progress**: Currently being worked on
- **closed**: Completed successfully
- **deferred**: Intentionally paused (can be resumed)
- **failed**: Cannot be completed (blocker, bug, or error)
- **blocked**: Waiting on external dependencies
- **awaiting_input**: Needs user clarification or decision (partially complete)

### Task Priority

Priority ranges from **0 (Critical)** to **4 (Backlog)**:

| Priority | When to Use |
|----------|-------------|
| 0 | Critical blocker or security issue |
| 1 | High-priority feature needed soon |
| 2 | Normal work (default) |
| 3 | Lower priority but important |
| 4 | Backlog / nice-to-have |

**System Agent Priority**: Tasks for `pm` always run first, regardless of numeric priority.

### Task Dependencies (DAG)

Tasks form a Directed Acyclic Graph where:
- **Open + unblocked** = all dependencies are closed
- **Blocked** = waiting for a dependency to close
- **Ready** = unblocked and available to work on

Example:
```
Design feature (abc)
├── Implement models (def) [depends on abc]
│   ├── Write tests (ghi) [depends on def]
│   └── Review code (jkl) [depends on def]
└── Update docs (mno) [depends on abc]
```

### Human Gate (needs_input)

When an agent encounters a decision they can't make, they use `status: "needs_input"`:

```json
{
  "status": "needs_input",
  "summary": "Need authentication strategy",
  "question": "Should auth use JWT or sessions?",
  "questionContext": "JWT works better across services, sessions simpler for monoliths."
}
```

The user responds with `bh respond <id> "answer"` and the agent resumes with `bh worker --resume`.

## Standard Handoff Patterns

### Design → Code/Test/Docs/Review

When `design` decomposes a feature:
- Create tasks with explicit `--deps` to chain them together
- Create a final `review` task that depends on all implementation
- Example:
  ```bash
  bh create -t "Design payment system" -r design -p 3
  # Design agent then creates:
  bh create -t "Implement payment API" -r code -p 3 --deps <design-id>
  bh create -t "Test payment flows" -r test -p 3 --deps <code-id>
  bh create -t "Document payment API" -r docs -p 3 --deps <code-id>
  bh create -t "Review payment implementation" -r review -p 2 --deps <code-id>,<test-id>,<docs-id>
  ```

### Code → Test/Docs

After implementing a feature:
- Create a `test` task with `--deps` on the code task
- Create a `docs` task if undocumented behavior exists

### Review → Code/Test

When `review` finds issues:
- Create `code` task with `--inherit-deps` (copy deps from reviewed task)
- Create `test` task with `--inherit-deps` to add test coverage
- Follow the bug-fix pattern, not the feature pattern

### Escalation

When you find work outside your scope:
- **Found a bug**: Create `code` task (type: `bug`)
- **Found missing tests**: Create `test` task with `--deps` on current
- **Found undocumented behavior**: Create `docs` task
- **Found architectural concerns**: Create `design` task
- **Task too large**: Create multiple tasks with dependencies

## Agent Capabilities

### Code Agent
- Implements features from task descriptions
- Writes production-quality code following project patterns
- Handles error cases and edge cases
- Creates follow-up tasks for tests, docs, refactoring
- Uses git to track changes

### Test Agent
- Writes comprehensive tests for code
- Tests edge cases and error conditions
- Improves test coverage
- Creates follow-up tasks for code fixes if tests reveal bugs

### Docs Agent
- Writes READMEs, API docs, guides
- Creates examples and tutorials
- Updates existing documentation
- Creates code tasks if documented behavior doesn't match code

### Design Agent
- Analyzes large features and breaks them into subtasks
- Creates task DAGs with dependencies
- Specifies architecture and design patterns
- Creates final review tasks to gate implementation

### Review Agent
- Performs code review for quality and security
- Checks test coverage and documentation
- Creates fix tasks for found issues
- Can escalate to design if architectural issues found

### PM Agent
- Manages overall backlog coherence
- Verifies nothing important is missed
- Ensures task priorities are correct
- Is a System Agent—its tasks run first

### Overseer Agent (Interactive)
- Bridges chat with task system
- Triages new requests into tasks
- Manages handoffs between agents
- Not automated—used for chat with humans

## Configuration

Project-wide settings in `.bh/config.json`:

```json5
{
  workflow: "coding",        // Default workflow
  defaults: {
    role: "code",            // Default agent role
    priority: 2,
    size: "medium"
  },
  models: {
    // Override model aliases if needed
    // heavy: "anthropic/claude-opus-4-5"
  },
  context_files: [
    "README.md",
    "CLAUDE.md"
  ]
}
```

## Task Naming Conventions

**Good task titles:**
- `Fix: Race condition in auth handler` — specific problem
- `Test: Edge cases in user validation` — clear scope
- `Docs: API authentication flow` — actionable
- `Design: Payment system refactor` — clear intent

**Poor task titles:**
- `Bug` — too vague
- `Tests` — what tests?
- `Update docs` — which docs?

## Commands Cheat Sheet

```bash
# Create tasks
bh create -t "Title" -r code -p 2 -s medium -y task
bh create -t "Title" -r code --deps abc,def            # Chain tasks
bh create -t "Title" -r test --inherit-deps abc        # Inherit dependencies

# List and view
bh list                    # All open tasks
bh list --ready            # Only unblocked tasks
bh tree                    # View dependency tree
bh tree -b                 # Show what each task unlocks
bh show abc                # Task details

# Work on tasks
bh next                    # Get next priority task
bh claim abc               # Mark as in_progress
bh close abc "Done"        # Complete task
bh worker --once           # Run one task with AI agent
bh worker --resume         # Resume interrupted task
bh respond abc "answer"    # Answer a needs_input question

# Manage dependencies
bh dep abc xyz,mno         # Add dependencies
bh dep abc --replace ""    # Clear all dependencies
```

## Tips for Agents

1. **Use `needs_input` liberally** for design decisions you can't make alone
2. **Create clear follow-up tasks** rather than doing everything yourself
3. **Document your assumptions** in task details when making decisions
4. **Check dependencies** before starting work (`bh show <id>`)
5. **Use `--inherit-deps`** when fixing issues found during review
6. **Don't wait for follow-ups** — complete your task and let orchestrators handle coordination

## See Also

- **`_preamble.md`**: Detailed coordination protocols and guidelines
- **Individual agent files** (code.md, test.md, etc.): Agent-specific instructions
- **CLAUDE.md** (project root): Architecture for AI assistants
- **beehive.skill.md**: Integration with Claude Code
