# Code Review Report

**Reviewed by:** claude-opus-4-6 (task tm-fh4, 2026-02-09)
**Reconstructed from:** `.bh/logs/worker-tm-fh4.md` (original file lost)

## 🔴 Critical

### C1: `isSystemAgent` duplication bug in `create.ts`
`create.ts` has its own local `isSystemAgent()` that only checks for `system: true`. The canonical version in `utils/agent.ts` also checks `isSystem: true`. The local copy is stale and out of sync — system tasks may not get priority routing.
**Fix:** Remove local copy, import from `utils/agent.ts`.

### C2: Failing test in `parse-agent-response.test.ts`
Test "should default missing status to completed when JSON is otherwise valid" expects `status='completed'` for empty status string, but the implementation correctly returns `'failed'`. Test is wrong, not the code.
**Fix:** Update test expectation to match current behavior.

### C3: Stale `size`/`type` references throughout docs
`size` (small/medium/large), `type` (bug/task/chore), `-s`/`-y` flags, and sorting by size/type are referenced in README, CLAUDE.md, and `_preamble.md` — but **none of these exist in the code**. Fields were removed but docs weren't updated. `init.ts` generates config with `size: medium` which doesn't exist.
**Fix:** Remove all stale references from docs and init templates.

### C4: README says "Priority 4 = highest" — backwards
README says "Priority: 0-4 (4 = highest priority)" and "Priority (descending) - higher priority first" but the code sorts by priority **ascending** (0 first). CLAUDE.md correctly says "Priority ascending — 0 (critical) before 4 (backlog)".
**Fix:** Correct README to match code: 0 = critical/highest, 4 = backlog/lowest.

## 🟡 Medium

### M1: `(config as any).config?.overseer` cast in 5 files
`ConfigManager` lacks a proper getter for overseer config, forcing 5 files to use unsafe `(config as any)` casts. Fragile and breaks encapsulation.
**Fix:** Add `getOverseerConfig()` getter to ConfigManager.

### M2: `loadTmDocs()` duplicated 3×
Near-identical implementations in `worker.ts`, `overseer.ts`, and `overseer-heartbeat.ts`.
**Fix:** Extract to shared utility in `src/utils/`.

### ~~M3: Orphaned `IN_REVIEW` state~~ ✅ RESOLVED
~~`TaskState.IN_REVIEW` exists in the enum and `tree.ts` but is never used in any workflow, undocumented, and not in the state machine diagram.~~
**Fixed:** Removed IN_REVIEW from types.ts, tree.ts, update.ts, and updated documentation. The GitHub PR integration uses direct state transitions (closed/failed) rather than an intermediate review state.

### M4: `docker-executor.ts` (332 lines) never imported
Dead code — produced by the Docker exploration task (tm-6uq) but never integrated.
**Fix:** Remove or move to `docker/` directory as prototype.

### M5: Task result-handling duplicated in Worker
The completed/failed/blocked/needs_input handling block is duplicated in `Worker.run()` and `Worker.runSpecificTasks()`.
**Fix:** Extract to `private handleTaskResult()` method.

### M6: `compareTasks()` docs don't match implementation
Documentation says sorting is "priority → size → type" but actual code is "isSystem → priority → createdAt". No size or type sorting exists.
**Fix:** Update docs to match implementation.

### M7: Unused imports
- `overseer.ts`: `readdir`, `homedir` imported but not used
- `poke.ts`: `fileURLToPath` imported but not used
**Fix:** Remove unused imports.

### M8: `OverseerHeartbeat.heartbeat()` is private
Called externally but marked private.
**Fix:** Make public.

## 🔵 Low

*(Additional findings referenced as L1-L10+ in the original report were not captured in detail in the worker log.)*

## Follow-up Tasks

The worker attempted to create 6 follow-up tasks via `bh create` but they didn't persist (worker died before backlog flush):

| Priority | Title | Scope |
|----------|-------|-------|
| P1 | Fix isSystemAgent duplication bug | C1 |
| P1 | Fix failing test | C2 |
| P1 | Fix documentation drift (size/type/priority) | C3, C4 |
| P2 | Add overseerConfig getter, cleanup dead code | M1, M4, M7 |
| P2 | Extract duplicated loadTmDocs and result-handling | M2, M5 |
| ~~P3~~ | ~~Remove or document IN_REVIEW state~~ ✅ DONE | ~~M3~~ |
