# Coding Workflow Improvements - Summary

## Changes Implemented

### 1. Created Shared Preamble (`workflows/coding/_preamble.md`)

A comprehensive coordination guide shared across all agents in the coding workflow:

**Content includes:**
- **Agent Roles Table**: Clear taxonomy of executor (code, test, docs) vs orchestrator (design, review, pm) agents
- **Handoff Protocol**: When and how agents should create follow-up tasks
- **Task Creation Syntax**: Complete reference with examples for `--deps`, `--inherit-deps`, `--test-command`
- **Priority Guidelines**: Rules for setting priority relative to current task (critical=0, same, current+1, backlog=4)
- **Dependency Patterns**: When to use explicit deps vs inherit-deps vs no deps
- **Standard Handoff Patterns Table**: 10+ common agent-to-agent handoff scenarios with examples
- **Task Naming Conventions**: Best practices (prefix with "Fix:", "Test:", etc.)
- **Task Management Commands**: Complete CLI reference
- **Escalation Guide**: What to do when you encounter issues outside your role
- **Review Gates**: Best practice of ending complex features with a review task

### 2. Updated Worker to Load Preamble (`src/commands/worker.ts`)

Modified the worker to:
- Search for `_preamble.md` in workflow directories (first match wins)
- Skip `_preamble.md` when discovering agent names
- Pass preamble to `parseAgentFile()`
- Prepend preamble to each agent's system prompt: `preamble + "\n\n---\n\n" + agent.md`
- Log when preamble is loaded: `📖 Loaded workflow preamble from <path>`

### 3. Added Escalation Sections to Executor Agents

#### `code.md`
- Added "Escalation" section explaining how to create follow-up tasks
- Examples: bug found elsewhere, need tests, task too large
- Explicit permission to create tasks and complete current task normally

#### `test.md`
- Added "Escalation" section for issues discovered while writing tests
- Examples: bug found, undocumented behavior, complex test needs breakdown
- Explicit guidance on creating bug-type tasks

#### `docs.md`
- Added "Escalation" section for issues revealed by documentation work
- Examples: incorrect behavior, missing tests, architectural questions
- Guidance on when to create code/test/design tasks

### 4. Fixed CLI Syntax Errors in `pm.md`

**Removed non-existent commands:**
- ❌ `bh list --state <state>`
- ❌ `bh list --role <role>`
- ❌ `bh dep add <id> <dep>`
- ❌ `bh dep remove <id> <dep>`

**Corrected to actual syntax:**
- ✅ `bh list --ready`
- ✅ `bh list --all`
- ✅ `bh dep <id> <dep1>,<dep2>,...` (set all at once)
- ✅ `bh dep <id> ""` (clear all)
- ✅ `bh tree -b` (blocked view)
- ✅ Added `-y` type flag to create examples

**Added delegation guidance:**
- Explicit instruction to delegate large feature decomposition to `design` agent
- Example: `bh create -t "Design: Authentication system" -r design -p 1 -s large`

### 5. Enhanced `review.md` Handoff Documentation

- Updated to use `--inherit-deps` in examples
- Added `-y bug` type flag to bug task examples
- Clarified that follow-up tasks should inherit context from reviewed task

### 6. Strengthened Review Gate in `design.md`

- Made review gate requirement more prominent in task breakdown guidelines
- Updated example to show complete DAG including review as final step
- Used correct `tm-` prefixed IDs in all examples
- Emphasized that review task should depend on ALL implementation tasks (code/test/docs)

### 7. Updated CLAUDE.md Documentation

#### Added Workflow Preamble Section
- Explained `_preamble.md` purpose and loading mechanism
- Documented search path (first workflow path where found)
- Showed how preamble is prepended to agent system prompts
- Provided example use cases

#### Added Future Enhancements Section
- Documented the auto-review hook concept (not yet implemented)
- Provided example config structure for `hooks` feature
- Explained benefits for ensuring review gates without manual task creation

## Benefits

### 1. **Consistency**
All agents now share the same understanding of:
- How to create tasks
- When to escalate
- Priority conventions
- Dependency patterns

### 2. **Reduced Errors**
- PM agent no longer uses non-existent CLI commands
- All ID examples use correct `tm-` prefix
- Type flags (`-y bug`) properly documented

### 3. **Better Handoffs**
- Explicit patterns for all common agent-to-agent workflows
- Clear guidance on when to use `--deps` vs `--inherit-deps`
- Standard naming conventions improve task readability

### 4. **Executor Empowerment**
- Code/test/docs agents can now escalate issues without failing
- Creates closed-loop system where all issues get tracked
- Reduces blocking and failed tasks

### 5. **Mandatory Review Gates**
- Design agent now knows to always create final review task
- Review requirement is prominent in documentation
- Reduces chance of shipping unreviewed code

### 6. **Maintainability**
- Single source of truth for coordination protocols (preamble)
- Changes to handoff patterns only need to be made in one place
- Easy to fork and customize per-project

## Testing

Build verification:
```bash
npm run build  # ✅ Successful, no errors
```

## Files Changed

1. `workflows/coding/_preamble.md` - **NEW** (6959 bytes)
2. `workflows/coding/code.md` - Added escalation section
3. `workflows/coding/test.md` - Added escalation section
4. `workflows/coding/docs.md` - Added escalation section
5. `workflows/coding/pm.md` - Fixed CLI syntax, added delegation guidance
6. `workflows/coding/review.md` - Enhanced handoff examples
7. `workflows/coding/design.md` - Strengthened review gate requirement
8. `src/commands/worker.ts` - Preamble loading logic
9. `CLAUDE.md` - Documented preamble system and future auto-review hook

## Next Steps (Optional)

1. **Test end-to-end**: Create a design task and verify the full DAG execution with review gate
2. **Implement auto-review hook**: Add configurable hooks system for automatic task creation
3. **Add preamble validation**: Check for common mistakes in task creation syntax
4. **Create workflow templates**: Add more specialized workflows (e.g., `workflows/math/`, `workflows/web/`)
