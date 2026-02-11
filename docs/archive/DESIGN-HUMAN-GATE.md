# Human Gate Design

## Overview

The Human Gate is a mechanism that allows AI agents to pause execution and request human input when they encounter decisions they cannot make confidently. This enables a human-in-the-loop workflow where agents can escalate uncertainty rather than guessing or failing.

## Problem Statement

Currently, when agents face ambiguous requirements or need clarification, they have limited options:
1. **Guess** — Make assumptions that may be wrong
2. **Fail** — Report `status: failed` and abort the task
3. **Block** — Report `status: blocked` (but this is semantically for dependency issues)

None of these are appropriate when an agent has done partial work but needs a human decision to proceed.

## Design Goals

1. **Minimal disruption**: Extend existing patterns rather than overhauling the system
2. **Clear semantics**: Distinguish "needs human input" from "blocked by dependencies"
3. **State preservation**: Allow agents to resume from where they left off after receiving input
4. **Audit trail**: Track questions asked and answers received for accountability
5. **CLI-first**: Humans interact via the `bh` CLI, not a separate interface

---

## Solution Architecture

### 1. New Task State: `awaiting_input`

Add a new state to the TaskState enum:

```typescript
export enum TaskState {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  CLOSED = 'closed',
  DEFERRED = 'deferred',
  FAILED = 'failed',
  BLOCKED = 'blocked',
  AWAITING_INPUT = 'awaiting_input'  // NEW
}
```

**State semantics:**
- `awaiting_input` — Task is paused, waiting for human input before agent can continue
- This is distinct from `blocked` (dependency issue) and `deferred` (intentionally postponed)

**State icon:** `❓` (question mark) for tree visualization

### 2. New Task Fields

Add fields to the Task interface to capture the question/answer flow:

```typescript
export interface Task {
  // ... existing fields ...
  
  // Human Gate fields
  question?: string;           // What the agent is asking
  questionContext?: string;    // Additional context for the question
  humanResponse?: string;      // The human's answer
  humanRespondedAt?: string;   // Timestamp of response
}
```

### 3. New Agent Status: `needs_input`

Extend the AgentResult interface:

```typescript
export interface AgentResult {
  status: 'completed' | 'failed' | 'blocked' | 'needs_input';  // Added needs_input
  summary: string;
  details: string;
  question?: string;         // Required when status is 'needs_input'
  questionContext?: string;  // Optional additional context
  issues?: string[];
}
```

### 4. Agent Response Format

Agents can now return a `needs_input` status:

```json
{
  "status": "needs_input",
  "summary": "Need clarification on authentication method",
  "question": "Should the API use JWT tokens or session cookies for authentication?",
  "questionContext": "The requirements mention 'secure authentication' but don't specify the method. JWT is more suitable for stateless APIs while session cookies work better for traditional web apps. The existing codebase doesn't have any auth implementation to reference.",
  "details": "Implemented the user model and registration endpoint. Paused before implementing login to confirm the authentication approach."
}
```

### 5. Worker Handling

When the worker receives a `needs_input` status:

```typescript
if (result.status === 'needs_input') {
  // Store the question on the task
  await this.manager.requestInput(
    task.id, 
    result.question || result.summary,
    result.questionContext
  );
  console.log(`❓ Task ${task.id} needs human input`);
  console.log(`   Question: ${result.question}`);
  // Do NOT rollback git changes — preserve partial work
  // Do NOT auto-commit — wait for human decision
}
```

### 6. TaskManager Methods

Add new methods to TaskManager:

```typescript
// Request human input
async requestInput(id: string, question: string, context?: string): Promise<Task> {
  const tasks = await this.storage.readTasks();
  const task = this.findTaskOrThrow(canonicalizeTaskId(id), tasks);
  
  task.state = TaskState.AWAITING_INPUT;
  task.question = question;
  task.questionContext = context;
  task.humanResponse = undefined;  // Clear any previous response
  task.humanRespondedAt = undefined;
  task.updatedAt = new Date().toISOString();
  
  await this.storage.writeTasks(tasks);
  return task;
}

// Provide human response
async respondToTask(id: string, response: string): Promise<Task> {
  const tasks = await this.storage.readTasks();
  const task = this.findTaskOrThrow(canonicalizeTaskId(id), tasks);
  
  if (task.state !== TaskState.AWAITING_INPUT) {
    throw new Error(`Task ${id} is not awaiting input (state: ${task.state})`);
  }
  
  task.humanResponse = response;
  task.humanRespondedAt = new Date().toISOString();
  task.state = TaskState.OPEN;  // Return to open so worker picks it up
  task.updatedAt = new Date().toISOString();
  
  await this.storage.writeTasks(tasks);
  return task;
}
```

### 7. New CLI Command: `bh respond`

```bash
# Respond to a task awaiting input
bh respond <task-id> "Use JWT tokens with 24h expiry"

# Interactive mode (opens $EDITOR for longer responses)
bh respond <task-id> --edit

# View pending questions
bh list --awaiting
```

**Command implementation:**

```typescript
export function registerRespondCommand(program: Command) {
  program
    .command('respond <id> [response]')
    .description('Provide human response to a task awaiting input')
    .option('-e, --edit', 'Open response in $EDITOR')
    .action(async (id: string, response: string | undefined, options) => {
      const storage = new TaskStorage();
      const manager = new TaskManager(storage);
      
      const task = await manager.showTask(id);
      
      if (task.state !== TaskState.AWAITING_INPUT) {
        console.error(`Error: Task ${id} is not awaiting input`);
        process.exit(1);
      }
      
      // Show the question
      console.log(`\nQuestion: ${task.question}`);
      if (task.questionContext) {
        console.log(`\nContext:\n${task.questionContext}`);
      }
      console.log();
      
      // Get response
      let finalResponse = response;
      if (options.edit || !response) {
        // Open in editor with question as context
        const template = `# Response to: ${task.title}\n\n` +
          `## Question\n${task.question}\n\n` +
          (task.questionContext ? `## Context\n${task.questionContext}\n\n` : '') +
          `## Your Response (write below this line)\n\n`;
        finalResponse = await openInEditor(template);
      }
      
      if (!finalResponse?.trim()) {
        console.error('Error: Response cannot be empty');
        process.exit(1);
      }
      
      const updated = await manager.respondToTask(id, finalResponse);
      console.log(`✓ Response recorded for task ${updated.id}`);
      console.log(`  Task returned to 'open' state and will be picked up by worker`);
    });
}
```

### 8. Agent Session Resumption

When the worker picks up a task that has a `humanResponse`:

1. The task's `sessionId` is preserved, so the agent resumes from its previous state
2. The user prompt includes the human's response:

```typescript
private buildUserPrompt(task: Task): string {
  let prompt = `# Task: ${task.title}\n\n`;
  
  // ... existing prompt building ...
  
  // Include human response if this is a resumption after awaiting input
  if (task.humanResponse) {
    prompt += `\n## Human Response to Your Question\n\n`;
    prompt += `**Question asked:** ${task.question}\n\n`;
    prompt += `**Human's answer:** ${task.humanResponse}\n\n`;
    prompt += `Please continue the task using this guidance.\n`;
  }
  
  return prompt;
}
```

---

## Workflow Example

### Step 1: Agent encounters ambiguity

```
🤖 Worker processing task tm-abc: Implement user authentication

Agent: "I need to implement authentication but the requirements don't specify 
the method. Should I use JWT or sessions? Let me ask..."

{
  "status": "needs_input",
  "question": "Should the API use JWT tokens or session cookies?",
  "questionContext": "JWT is better for stateless APIs, sessions for web apps...",
  "summary": "Need auth method clarification"
}

❓ Task tm-abc needs human input
   Question: Should the API use JWT tokens or session cookies?
```

### Step 2: Human discovers pending question

```bash
$ bh list --awaiting
❓ tm-abc [awaiting_input] Implement user authentication
   Question: Should the API use JWT tokens or session cookies?
```

### Step 3: Human provides response

```bash
$ bh respond tm-abc "Use JWT tokens. We're building a mobile-first API."
✓ Response recorded for task tm-abc
  Task returned to 'open' state and will be picked up by worker
```

### Step 4: Agent resumes with answer

```
🤖 Worker processing task tm-abc: Implement user authentication

Agent receives prompt including:
  ## Human Response to Your Question
  **Question asked:** Should the API use JWT tokens or session cookies?
  **Human's answer:** Use JWT tokens. We're building a mobile-first API.

Agent continues implementation with JWT approach...

{
  "status": "completed",
  "summary": "Implemented JWT-based authentication",
  "details": "Added login/register endpoints, JWT middleware..."
}
```

---

## Tree Visualization

```
$ bh tree

tm-xyz [open] Design payment system
├── tm-abc [awaiting_input] ❓ Implement user authentication
│   └── Question: Should the API use JWT tokens or session cookies?
├── tm-def [open] Implement payment API
└── tm-ghi [open] Write integration tests
```

---

## List Command Enhancement

```bash
$ bh list --awaiting

Awaiting Human Input:

tm-abc   P2  medium  Implement user authentication
         ❓ Should the API use JWT tokens or session cookies?
         Context: JWT is better for stateless APIs...
         Asked: 2 hours ago

tm-xyz   P1  small   Configure deployment
         ❓ Which cloud provider should we use?
         Asked: 30 minutes ago
```

---

## Alternative Approaches Considered

### Option A: Use `blocked` status with special handling
**Rejected:** `blocked` has established semantics for dependency issues. Overloading it creates confusion.

### Option B: Create a `human` agent role
**Rejected:** This would require humans to manually close tasks, breaking the automation flow. The gate approach allows seamless resumption.

### Option C: Webhook/notification system
**Considered for future:** Could add optional webhooks to notify humans (Slack, email, etc.) when input is needed. Deferred to keep initial implementation simple.

### Option D: Inline editor in worker output
**Rejected:** Would require keeping the worker running while waiting for input, consuming resources and making it harder to handle async workflows.

---

## Implementation Plan

### Phase 1: Core Infrastructure (Tasks: 4)

1. **Add TaskState.AWAITING_INPUT** (`code`, small)
   - Update `types.ts` with new state
   - Update `validation.ts` to recognize the new state
   - Update tree icons in `tree.ts`

2. **Add human gate task fields** (`code`, small)
   - Add `question`, `questionContext`, `humanResponse`, `humanRespondedAt` to Task interface
   - No migration needed — fields are optional

3. **Add TaskManager methods** (`code`, medium)
   - `requestInput(id, question, context)`
   - `respondToTask(id, response)`
   - Unit tests for both methods

4. **Update parseAgentResponse** (`code`, small)
   - Accept `needs_input` as valid status
   - Parse `question` and `questionContext` fields

### Phase 2: Worker Integration (Tasks: 2)

5. **Handle needs_input in worker** (`code`, medium)
   - Call `requestInput()` when agent returns `needs_input`
   - Skip auto-commit and rollback for this status
   - Preserve session for later resumption

6. **Include humanResponse in resumed prompts** (`code`, small)
   - Update `buildUserPrompt()` to include the Q&A when resuming

### Phase 3: CLI Commands (Tasks: 3)

7. **Implement `bh respond` command** (`code`, medium)
   - Basic response via CLI argument
   - `--edit` flag for $EDITOR integration
   - Validation and error handling

8. **Add `--awaiting` flag to `bh list`** (`code`, small)
   - Filter to only show `awaiting_input` tasks
   - Display question in output

9. **Update `bh show` for awaiting tasks** (`code`, small)
   - Show question, context, and response history

### Phase 4: Agent Instructions (Tasks: 2)

10. **Update preamble with human gate guidelines** (`docs`, small)
    - When to use `needs_input` vs. making assumptions
    - How to write good questions

11. **Update agent.md files with needs_input option** (`docs`, small)
    - Add to code, design, review agents
    - Examples of good vs. bad questions

### Phase 5: Testing & Documentation (Tasks: 2)

12. **Integration tests for human gate flow** (`test`, medium)
    - Test full cycle: agent asks → human responds → agent resumes
    - Test edge cases (empty response, task not awaiting, etc.)

13. **Update README and CLAUDE.md** (`docs`, small)
    - Document the feature
    - Add examples

---

## Task Dependency Graph

```
[1: Add state] ─┬─► [3: TaskManager methods] ─┬─► [5: Worker handling]
                │                              │
[2: Add fields] ┘                              └─► [6: Resume prompts]
                                                        │
[4: Parse response] ────────────────────────────────────┘
                                                        │
                                               [7: bh respond] ─┬─► [12: Integration tests]
                                                                │
[8: list --awaiting] ◄──────────────────────────────────────────┤
                                                                │
[9: bh show update] ◄───────────────────────────────────────────┘
                                                                
[10: Preamble docs] ─┬─► [13: README update]
                     │
[11: Agent docs] ────┘
```

---

## Success Criteria

1. **Agents can request input**: `needs_input` status is properly handled
2. **State preservation**: Partial work is not rolled back or committed prematurely
3. **Seamless resumption**: Agents can continue from where they left off
4. **CLI discoverability**: Users can easily find and respond to pending questions
5. **Audit trail**: Question/answer pairs are preserved in task history
6. **No breaking changes**: Existing workflows continue to work

---

## Future Enhancements

1. **Notifications**: Webhook support for Slack/email when input is needed
2. **Timeout handling**: Auto-fail or auto-defer tasks awaiting input beyond a threshold
3. **Batch responses**: `bh respond --all` to handle multiple questions at once
4. **Response templates**: Pre-defined responses for common questions
5. **Confidence scores**: Agents could report confidence levels to help decide when to ask
