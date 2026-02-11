# Coding Workflow - Agent Coordination

This preamble is shared across all agents in the coding workflow to ensure consistent handoffs and coordination.

## Testing beehive Development

**⚠️ Important**: When working on the beehive project itself and testing CLI commands, always use the `sandbox/` directory to avoid polluting the main project backlog:

```bash
cd sandbox
bh create -t "Test task" -p 2
bh list
# etc.
```

The sandbox directory is gitignored and has its own isolated `.bh/backlog.json`. See `sandbox/README.md` for details.

## Agent Roles

| Role | Type | Responsibility |
|------|------|----------------|
| `code` | Executor | Implement features, fix bugs |
| `test` | Executor | Write and maintain tests |
| `docs` | Executor | Write and update documentation |
| `design` | Orchestrator | Architecture, feature decomposition into task DAGs |
| `review` | Orchestrator | Code review, quality verification, issue identification |
| `pm` | Orchestrator | Backlog management, completeness verification, project coherence |

**Executors** do the hands-on work and complete tasks.  
**Orchestrators** plan, verify, and create tasks for executors to handle.

### System Agents

Some agents (like `pm`) are designated as **System Agents**. Their tasks are prioritized above all others, regardless of numeric priority, to ensuring governance and oversight happen before execution.

- **System Priority**: `isSystem` tasks > Priority 0 > Priority 1...
- **Triggering**: System tasks can be created manually or by other agents (e.g., `design` requesting PM verification).

## Handoff Protocol

### When to Create Follow-up Tasks

**Executors should create tasks when:**
- You discover a bug outside your current task's scope → create `code` task
- You find missing tests while implementing → create `test` task  
- You identify undocumented behavior that needs explanation → create `docs` task
- The task is too large and should be broken down → create multiple smaller tasks with dependencies

**Orchestrators should create tasks when:**
- `design`: Always decompose large features into executable subtasks
- `review`: Found issues that need fixing → create `code` or `test` tasks
- `pm`: Found missing functionality, bugs, or backlog gaps → create appropriate tasks

### Task Creation Syntax

```bash
# Basic task creation
bh create -t "Title" -r <role> -p <priority> -s <size> -y <type>

# With dependencies (explicit)
bh create -t "Title" -r code -p 2 --deps tm-abc,tm-def

# With inherited dependencies (copies deps from parent task)
bh create -t "Title" -r test -p 2 --inherit-deps tm-abc
```

### Priority Guidelines

When creating follow-up tasks, set priority relative to the current task:

| Situation | Priority |
|-----------|----------|
| Critical bug blocking current work | 0 (critical) |
| High-priority fix needed before feature completion | 1 (high) |
| Normal follow-up work | Same as current task |
| Nice-to-have improvement | Current priority + 1 |
| Future enhancement | 4 (backlog) |

### Dependency Patterns

**Use `--deps` when:**
- You're explicitly building a task chain (A → B → C)
- You know the exact IDs of prerequisite tasks
- Example: `design` agent creating a full DAG

**Use `--inherit-deps` when:**
- Creating a follow-up task that needs the same prerequisites as another task
- Example: `review` finds a bug in task `tm-abc` — the fix should inherit `tm-abc`'s dependencies

**No dependencies when:**
- The task is independent (bug fix, improvement, unrelated feature)
- You're unsure of dependencies (leave it for `design` or `pm` to organize)

### Standard Handoff Patterns

| From Agent | To Agent | Pattern | Example |
|------------|----------|---------|---------|
| `design` | `code`, `test`, `docs`, `review` | Create full DAG with explicit `--deps`; final `review` task depends on all implementation tasks | Feature decomposition |
| `code` | `test` | Create test task with `--deps` on current task | "Write tests for X" after implementing X |
| `code` | `code` | Create fix task with same priority, no deps | Found unrelated bug while working |
| `review` | `code` | Create fix task with `--inherit-deps` from reviewed task | Bug found during review |
| `review` | `test` | Create test task with `--inherit-deps` from reviewed task | Missing test coverage |
| `test` | `code` | Create bug task (type: `bug`) with same priority | Discovered bug while writing tests |
| `docs` | `code` | Create clarification task | Found undocumented behavior that seems wrong |
| `pm` | `design` | Create design task for large features | Don't decompose yourself — delegate to design agent |
| `pm` | `code`/`test`/`docs` | Create specific executor tasks | Small, well-defined work items |

### Task Naming Conventions

Use clear, actionable titles:

✅ **Good:**
- "Fix race condition in auth handler"
- "Add tests for edge cases in parser"
- "Document API authentication flow"

❌ **Bad:**
- "Bug"
- "Tests"
- "Update docs"

Include context-specific prefixes when helpful:
- `Fix: ` — for bug fixes
- `Test: ` — for test tasks
- `Docs: ` — for documentation
- `Review: ` — for review tasks

### Completing Your Task

After creating follow-up tasks, complete your own task normally. Don't wait for the follow-ups to finish.

**Completion Status Options:**

- **completed**: Task successfully finished
- **failed**: Cannot complete (error, bug, blocker)
- **blocked**: Waiting on external dependencies
- **needs_input**: Requires user clarification or decision

**Completed Example:**
```json
{
  "status": "completed",
  "summary": "Implemented user login feature; created 2 follow-up tasks",
  "details": "Implementation complete. Created:\n- tm-x7z: Add rate limiting tests\n- tm-m3n: Document OAuth flow\n\nFiles changed: auth.ts, routes.ts"
}
```

**Needs Input Example:**
When you need user clarification, design decision, or missing information:
```json
{
  "status": "needs_input",
  "summary": "Need API endpoint for authentication",
  "details": "Cannot proceed without knowing the correct endpoint URL",
  "question": "What is the API endpoint URL for user authentication?",
  "questionContext": "The documentation doesn't specify the endpoint. I need this to configure the auth module."
}
```

The worker will preserve your partial work and session. The user can respond with `bh respond <id> "answer"` and resume with `bh worker --resume`.

## Human Gate Guidelines

**Decision Framework**: When you encounter missing information, use this flowchart:

1. **Can I make a reasonable, documented assumption?** → Make it with clear reasoning in `details`
2. **Is this a critical decision that affects architecture/security?** → Use `needs_input`
3. **Would the wrong choice waste significant time/resources?** → Use `needs_input`
4. **Is this an impossible situation (bug, broken tooling)?** → Use `failed`
5. **Am I waiting for external services/events?** → Use `blocked`

### When to Use `needs_input`

Use `needs_input` when you need **user clarification, a design decision, or missing information** that significantly impacts the solution:

**Good candidates for needs_input:**
- **Architecture decisions**: "Should we use REST or GraphQL for the API?"
- **Design choices**: "Should authentication be JWT or session-based?"
- **Configuration**: "What is the production database connection string?"
- **Priority/scope**: "Should we optimize for performance or simplicity?"
- **Unclear requirements**: "The spec doesn't define error handling behavior"
- **Ambiguous specifications**: "Is 'fast' < 1s or < 100ms?"
- **External dependencies**: "I need credentials for the Stripe API account"
- **Clarification on intent**: "Does 'encrypt passwords' mean bcrypt or AES?"

**Examples of good questions:**

```json
{
  "status": "needs_input",
  "summary": "Need authentication strategy decision",
  "details": "The task requires implementing user authentication, but the requirements don't specify the approach.",
  "question": "Should the authentication system use JWT tokens or session cookies?",
  "questionContext": "JWT is better for distributed systems and mobile apps. Sessions are simpler for monoliths but require state storage. What's the expected architecture?"
}
```

```json
{
  "status": "needs_input",
  "summary": "Missing database schema details",
  "details": "Cannot implement user model without knowing field requirements.",
  "question": "What fields are required for the user table (name, email, phone, etc)?",
  "questionContext": "This determines the schema design and API contract."
}
```

```json
{
  "status": "needs_input",
  "summary": "Unclear performance requirements",
  "details": "Task mentions 'optimize for performance' but no metrics are defined.",
  "question": "What are the target performance metrics? (e.g., < 100ms response time, < 1MB bundle)",
  "questionContext": "This will determine implementation strategy: caching, indexing, code splitting, etc."
}
```

### When to Make Assumptions

Make assumptions when you have **sufficient context to proceed safely** and can document your reasoning:

**Good candidates for assumptions:**
- **Naming conventions**: "Following existing project patterns for file naming"
- **Code style**: "Using the project's existing formatting and eslint rules"
- **Error handling**: "Following the established error handling pattern in the codebase"
- **Default values**: "Using sensible defaults that match the rest of the application"
- **Minor implementation details**: "Using the standard library function instead of a third-party package"
- **Reversible decisions**: "Starting with this approach; can refactor if needed"

**Always document your assumptions in `details`:**

```json
{
  "status": "completed",
  "summary": "Implemented user registration endpoint",
  "details": "Created POST /api/users endpoint with password hashing using bcrypt (following existing auth patterns). Assumed rate limiting should match the login endpoint (100 req/hour). Email validation uses the existing validator in utils/. Password requirements: 8+ chars, 1 uppercase, 1 number (matching the spec exactly).",
  "files": ["src/routes/users.ts", "src/middleware/validation.ts"]
}
```

### When to Fail

Use `failed` when the task **cannot be completed** due to blockers within the codebase:

**Good candidates for failed:**
- **Broken dependencies**: "The library version specified in package.json has a known bug"
- **Missing files**: "The core module referenced in the task doesn't exist"
- **Configuration errors**: "The .env file is missing required keys"
- **Impossible constraints**: "The task requires 5 endpoints in 1 hour without prior context"
- **Bugs in dependencies**: "The installed package has a critical bug blocking implementation"

**Always provide clear context for failures:**

```json
{
  "status": "failed",
  "summary": "Cannot implement feature without fixing dependency",
  "details": "The task requires using the `validate-email` package, but version 2.1.0 (in package.json) has a critical bug that rejects all valid email addresses. Attempted workaround but it requires rewriting the validation logic entirely.\n\nRequired action: Update package to 2.2.0 or newer, OR use a different email validation library.\n\nFiles checked: package.json, src/services/email-validator.ts, test/email-validator.test.ts",
  "question": "Should I update the validate-email package or switch to a different library?"
}
```

### Decision Examples

| Situation | Decision | Why |
|-----------|----------|-----|
| "Spec says 'sort users'—ascending or descending?" | `needs_input` | Affects API contract and UI expectations |
| "No file sorting style defined; use camelCase?" | Assumption | Follows existing patterns in codebase |
| "Missing password complexity requirements" | `needs_input` | Critical for security and UX |
| "Should we cache this query result?" | `needs_input` | Architecture decision with trade-offs |
| "TypeScript import extension style?" | Assumption | Project standard is already established |
| "What timezone for timestamps?" | `needs_input` | Data correctness across regions |
| "Use UUID or auto-increment IDs?" | `needs_input` | Affects database design and API |
| "Minor type annotation missing" | Assumption + create follow-up | Document in code and note in task details |

## Task Management Commands

```bash
# View tasks
bh list                    # All open tasks
bh list --ready            # Unblocked tasks only
bh list --all              # Include closed tasks
bh show <id>               # Task details
bh tree                    # Dependency tree (goal-first view)
bh tree -b                 # Blocked view (shows what each task unlocks)

# Create tasks
bh create -t "Title" -r <role> -p <priority> -s <size> -y <type>
# Roles: code, test, docs, design, review, pm
# Priority: 0 (critical) to 4 (backlog), default: 2
# Size: small, medium, large
# Type: bug, task, chore

# Manage dependencies
bh dep <id> <csv>          # Set dependencies (comma-separated IDs)
bh dep <id> ""             # Clear all dependencies

# Update tasks
bh update <id> [options]   # Update any task field
bh close <id> "Summary"    # Close task
bh reopen <id>             # Reopen task
```

## Escalation Guide

If you encounter something outside your role:

| You Are | You Found | Action |
|---------|-----------|--------|
| `code` | Bug in unrelated code | Create `code` task (type: `bug`) |
| `code` | Missing tests | Create `test` task with `--deps` on your current task |
| `code` | Task too large | Create multiple `code` tasks with dependencies |
| `test` | Bug while writing tests | Create `code` task (type: `bug`) |
| `test` | Undocumented behavior | Create `docs` task |
| `docs` | Incorrect behavior (seems like bug) | Create `code` task for investigation |
| `docs` | Missing tests | Create `test` task |
| Any | Architectural concerns | Create `design` task for analysis |
| Any | Need code review | Create `review` task with `--deps` on completed work |

## Review Gates

**Best Practice:** Complex features should end with a `review` task that depends on all implementation work.

`design` agent: Always create a final `review` task in your DAG.  
`code` agent: Consider creating a `review` task before marking large features complete.

Example:
```bash
# After implementing tm-abc, tm-def, tm-ghi
bh create -t "Review: User authentication implementation" -r review -p 2 --deps tm-abc,tm-def,tm-ghi
```
