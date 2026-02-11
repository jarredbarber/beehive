# Math Research Workflow Design

## Motivation

The current math workflow uses a top-down decomposition: advisor plans lemma DAG → executor proves each lemma → verifier checks. The Erdős experiments (729 and 410) revealed three structural problems:

1. **Mathematical reasoning and Lean formalization are different skills.** In every experiment, NL proofs were correct from early attempts while Lean compilation took 3-5x longer. Agents hallucinated Mathlib identifiers systematically — a knowledge gap, not a reasoning failure. Combining both skills in one role wastes the expensive model on the wrong bottleneck.

2. **Top-down decomposition is fragile.** The advisor must predict the full proof structure upfront. In 729, the advisor created parallel tasks that were actually sequential — the executor caught the dependency error but couldn't fix it. In 410, the advisor's 14-task DAG crashed and wiped the backlog.

3. **Agents surrender on hard problems.** When agents saw "open conjecture" or "unsolved" in any context, they defaulted to writing STATUS.md files documenting why they couldn't proceed, closing tasks as "blocked on open conjecture," and refusing to attempt proofs. This required overseer intervention (deleting defeatist files, scrubbing comments, even lying about problem status) to overcome.

## Key Insight: Math as a Social System

Human mathematics works through specialization and shared literature:

- **Researchers** explore directions, publish papers (proofs, conjectures, lemmas)
- **Formalists** encode results rigorously in proof assistants
- **Peer reviewers** check correctness before publication
- **The literature** is the shared medium — agents don't coordinate directly, they read and cite each other's work

The workflow mirrors this structure with one critical addition: **information asymmetry**. The advisor knows the problem is hard; the workers don't. This is a feature, not a bug.

## Architecture

### Roles

| Role | Direction | Medium | Output | Judge | Model |
|------|-----------|--------|--------|-------|-------|
| `explore` | Forward | Natural language | `proofs/*.md` | `verify` (peer review) | Cheap (flash) |
| `formalize` | Backward | Lean 4 | `Erdos/*.lean` | `lake build` (compiler) | Expensive (pro/opus) |
| `advisor` | Both | Reads everything | Tasks, gap analysis | Human / overseer | Heavy |
| `verify` | Neither | Reads `proofs/*.md` | Approve / reject | — | Medium |

### Explore (Forward, NL)

Works forward from known results. Does creative mathematical reasoning without touching Lean.

**Responsibilities:**
- Investigate proof approaches and strategies
- Prove lemmas informally with full rigor in natural language
- Write proof sketches, conjectures, observations
- Publish results to `proofs/*.md`

**Does NOT:**
- Write Lean code
- Read or modify `.lean` files
- Read `sorry` goals or Lean compiler output
- See problem difficulty metadata (open/closed status, historical attempts)

**Model:** Cheap/fast (flash-tier). High volume, many dead ends acceptable. The explore role is where creative insight happens — quantity over precision. Most exploration is throwaway; only verified results get expensive formalization.

**Framing:** Explore tasks should always be framed as "prove this result" — never "investigate whether this is provable." The agent should believe every task is routine.

**Output format:** Markdown files in `proofs/` with:
- Clear statement of what is being proved
- Full proof with all steps justified
- Assumptions stated explicitly
- Confidence level (certain / high / moderate / low)
- References to other proofs in the literature directory

### Formalize (Backward, Lean)

Works backward from `sorry` holes in the Lean source. Translates known results into compiling code.

**Responsibilities:**
- Read current `sorry` goals from the compiler (their types are exact specifications)
- Search the literature (`proofs/*.md`) for results that match current goals
- Write Lean tactics/terms to close `sorry` holes
- May introduce new `sorry` holes as intermediate steps (must compile)
- Use `lake env lean` with temp files to discover Mathlib API before writing proofs
- Use `exact?`, `apply?`, `grep` over Mathlib to find correct lemma names

**Does NOT:**
- Do creative mathematical reasoning or invent new proof strategies
- Modify the main theorem statement
- Guess Mathlib lemma names — must verify they exist first

**Model:** Expensive (pro/opus-tier). Each attempt involves compilation cycles, so precision matters. Only triggered when verified NL proofs exist in the literature.

**Key constraints:**
- Every commit must compile (`lake build` succeeds, enforced by `testCommand`)
- New `sorry` holes are acceptable — they become new tasks
- Compilation failures trigger retry-with-feedback (error output appended to context)
- Small focused lemmas (10-50 lines), never monolithic 300+ line proofs

**Branch strategy:** Each formalize task gets its own `task/<id>` branch. Merge to main only on successful `lake build`. Failed branches are preserved for reference — partial work is never destroyed.

### Advisor (Gap Analyst + Psychologist)

Reads both the backward goals (Lean `sorry` types) and the forward literature (`proofs/*.md`) and identifies connections. Also actively manages worker context and framing.

The advisor is **inside the system** — it runs as a worker task like any other role. This means it can fall victim to the same failure modes it's supposed to prevent (it surrendered in 410, writing STATUS.md and closing everything as blocked). The **overseer** (see below) exists to catch these cases.

**Responsibilities:**
- Run `lake build` to extract current `sorry` goal types
- Read the literature directory for available proven results
- Spot where a forward result could close a backward goal
- Create bridging tasks (small, focused formalization tasks)
- Direct explore agents toward useful directions based on what formalize needs
- Manage the overall proof strategy
- **Translate Lean goals into mathematical language** for explore tasks (explore never sees Lean)
- **After failures, provide enriched context** — list compiled helpers, quote specific errors, suggest tactics
- **Maintain the strategic framing** (see below)

**Key question the advisor answers:** "The backward side needs X. The forward side has Y. How do we connect them?"

**Information asymmetry:** The advisor is the ONLY worker role that sees:
- Problem difficulty metadata (open/closed, historical attempts)
- Failure history from previous attempts
- The big picture of what's hard and what's routine

The advisor translates this into neutral, actionable task descriptions for workers. Workers should never see language like "open conjecture," "this is the hard part," or "previous attempts failed because..."

**Strategic framing (dynamic):** The advisor maintains a worker-visible version of the problem context that steers proof search through calibrated difficulty framing. This framing is updated based on results:

1. **Initial framing**: "Elementary proof using existing Mathlib lemmas" → agents try simple tactic chains, `exact?`, `simp`
2. **After shallow failures**: "Standard techniques from analytic number theory — Legendre's formula and Bertrand's postulate" → agents reach for specific tools
3. **After targeted failures**: "The key step uses [specific lemma] applied to [specific subgoal]" → agents have a concrete starting point
4. **Never escalate to**: "This is hard / open / unknown" → triggers surrender

Each escalation reveals more proof structure without revealing difficulty. The advisor tracks which framing level is active and escalates only when the current level produces failures.

**Rewriting failed tasks:** When a task fails, the advisor doesn't just reopen it. It:
1. Reads the failure details (compiler errors, mathematical gaps)
2. Lists which helper lemmas already compile and are available
3. Quotes specific error messages that blocked progress
4. Suggests concrete fixes or alternative tactics
5. Reduces scope if the task was too large
6. Escalates the strategic framing one level (more specific hints)
7. Creates a new task with this enriched description

This pattern (detailed error feedback in task descriptions) was the single biggest accelerator in the 729 experiment — attempt 5 succeeded in 30 minutes after the overseer prepared detailed context.

### Overseer (External Watchdog)

The overseer is **outside the system** — it is not a worker role and does not run as a task. It monitors the entire workflow from an external vantage point, including the advisor's behavior.

**Why it exists:** The advisor is inside the system and can fall victim to the same failure modes as other agents. In the 410 experiment, the advisor itself surrendered (wrote STATUS.md, closed everything as blocked). The overseer caught this and course-corrected.

**Responsibilities:**
- Periodic health checks (sorry count trajectory, cost, task throughput)
- Detect when the advisor has surrendered or stalled
- Delete defeatist artifacts (STATUS.md, "open problem" comments)
- Override the advisor's strategic framing if needed
- Kill runaway workers, manage API budget
- Make judgment calls the advisor can't (e.g., deploying deliberate misinformation about problem status)

**Key distinction from advisor:**

| | Advisor | Overseer |
|---|---|---|
| Position | Inside the system | Outside the system |
| Runs as | Worker task (system agent) | External process (periodic heartbeat) |
| Can fail? | Yes — same failure modes as workers | Only if not running |
| Manages | Workers (explore, formalize, verify) | The advisor + the whole system |
| Sees | Everything except its own blind spots | Everything including advisor failures |
| Creates tasks? | Yes (for workers) | Yes (for the advisor) |

**Future:** A periodic heartbeat/cron mechanism will wake the overseer at configurable intervals to check system health and intervene if needed.

### Verify (Peer Review)

Reviews natural language proofs before they enter the literature. Catches flawed approaches before formalization effort is wasted.

**Responsibilities:**
- Check logical correctness of proofs in `proofs/*.md`
- Identify hidden assumptions, gaps in reasoning, missing cases
- Verify quantifier precision (∀ vs ∃, bounds, edge cases)
- Approve (proof enters literature as "verified" ✅)
- Reject with specific feedback (explore agent revises)
- Request revision for minor issues

**Does NOT:**
- Review Lean code (the compiler does that)
- Write proofs or Lean code
- Fix errors directly — creates follow-up tasks for explore

**Key value:** In the 729 experiment, every NL proof was correct, but this won't always hold. A flawed NL proof that gets "verified" would waste an entire expensive formalization cycle. Verify is the cheap gate before the expensive step.

## The Literature Directory

`proofs/` is the decoupling mechanism between forward and backward work.

### Structure
```
proofs/
  README.md              # Index of all results with status
  legendre-formula.md    # Verified ✅
  digit-sum-bound.md     # Verified ✅  
  crude-bound.md         # Under review 🔍
  log-conversion.md      # Draft ✏️
  failed-approach-1.md   # Rejected ❌ (kept for reference)
```

### Metadata per file
```markdown
# Digit Sum Upper Bound

**Status:** Verified ✅ | Under review 🔍 | Draft ✏️ | Rejected ❌
**Author task:** tm-abc
**Reviewed by:** tm-def
**Statement:** For all primes p and natural numbers n, s_p(n) ≤ (p-1)(log_p(n) + 1)
**Dependencies:** Legendre formula (legendre-formula.md)
**Confidence:** High

## Proof
...
```

### Workflow
1. `explore` writes a draft → status: Draft ✏️
2. `verify` reviews it → status: Verified ✅ or Rejected ❌
3. `formalize` reads only verified results when looking for ways to close `sorry` holes
4. `advisor` reads everything (including rejected) to spot patterns and redirect exploration
5. Rejected proofs are kept — they document dead ends and prevent re-exploration

## Bidirectional Search

### Backward (from goal)

```
erdos_729 (sorry)
  ├── apply key_inequality → subgoal: ∀ p > P, a + b ≤ n + s_p(a) + s_p(b) (sorry)
  │   ├── apply legendre → subgoal: legendre_formula (sorry)  
  │   └── subgoal: digit_sum_bound (sorry)
  └── subgoal: ∃ suitable prime p (sorry)
      └── apply bertrand → subgoal: ... (sorry)
```

Each `sorry` has a compiler-generated type. That type IS the task specification — no ambiguity, no goal drift. The compiler enforces the true dependency structure.

**Checkpoint property:** Every intermediate state compiles. `sorry` warnings are expected; errors are not. This means:
- Progress is never lost (each sorry-reduction is a committed, compilable checkpoint)
- Regressions are impossible (a proven lemma can't break)
- The remaining work is always precisely enumerated (`grep sorry Erdos/*.lean`)

### Forward (from knowledge)

```
proofs/legendre-formula.md     ← proves ν_p(n!) = (n - s_p(n))/(p-1)
proofs/digit-sum-bound.md      ← proves s_p(n) ≤ (p-1)(log_p(n) + 1)
proofs/bertrand-postulate.md   ← proves ∃ prime in (n, 2n)
proofs/key-inequality.md       ← proves the main bound using above
```

### The Join

The advisor notices:
- Backward side has `sorry : s_p(n) ≤ (p-1) * (Nat.log p n + 1)`
- Forward side has `proofs/digit-sum-bound.md` (verified ✅) proving exactly this
- Creates a formalize task: "Close the digit_sum_bound sorry using the approach in proofs/digit-sum-bound.md"

This is a small, focused task with clear input (the verified NL proof) and clear output (compiling Lean replacing the sorry). Much easier than asking one agent to do both the math and the Lean.

## Task Flow

### Phase 1: Initial Exploration
```
advisor: "Read the problem. Create explore tasks for promising proof directions."
  → explore: "Prove Legendre's formula bounds" → proofs/legendre-formula.md (Draft)
  → explore: "Prove digit sum upper bound" → proofs/digit-sum-bound.md (Draft)
  → verify: review each draft
  → Results: proofs/legendre-formula.md (Verified ✅), proofs/digit-sum-bound.md (Verified ✅)
```

### Phase 2: Proof Skeleton
```
advisor: "We have verified NL proofs. Create the backward skeleton."
  → formalize: "Write main theorem proof with sorry holes for each lemma"
  → lake build succeeds with sorry warnings
  → advisor: extract sorry types, match against literature
```

### Phase 3: Bridging
```
advisor: "sorry X matches proofs/digit-sum-bound.md. Create formalize task."
  → formalize: "Close sorry X using approach from proofs/digit-sum-bound.md"
  → lake build (no sorry for X)
  → repeat for each sorry
```

If a sorry has no matching literature:
```
advisor: "sorry Y has type T. No literature matches."
  → advisor translates T into mathematical language
  → explore: "Prove [mathematical statement equivalent to T]"
  → verify: review
  → formalize: close sorry Y
```

### Phase 4: Completion
```
lake build → no warnings, no sorry → proof complete
```

## Configuration

### `.bh/config.json`
```json
{
  "workflow": "math-research",
  "testCommand": "lake build 2>&1",
  "testRetries": 3,
  "git": {
    "strategy": "branch"
  },
  "models": {
    "heavy": "anthropic/claude-opus-4-6:high",
    "medium": "anthropic/claude-sonnet-4-5",
    "light": "google/gemini-2.5-flash"
  }
}
```

### Model Assignment by Role
| Role | Model tier | Rationale |
|------|-----------|-----------|
| `explore` | light | High volume, creative, most output is throwaway |
| `formalize` | heavy | Precision matters, compilation cycles are expensive |
| `advisor` | heavy | Needs to read everything and make strategic decisions |
| `verify` | medium | Careful reading but not creative or technical |

## Anti-Patterns to Prevent

### The Surrender Pattern
**Symptom:** Agent writes STATUS.md, closes tasks as "blocked on open conjecture," refuses to attempt proof.
**Cause:** Agent sees difficulty metadata (open/unsolved/conjecture) in context.
**Prevention:**
- Never put "open," "unsolved," "conjecture," or "unknown" in explore/formalize task descriptions
- Advisor strips this language when creating tasks
- Problem.md visible to advisor only (or sanitized version for workers)
- If detected: advisor deletes defeatist artifacts, rewrites tasks with neutral framing

**Framing as search guidance:** In the 410 experiment, telling agents "the proof is elementary and uses Mathlib" didn't just prevent surrender — it *changed the proof search strategy*. The agent approached it as "find the elementary proof" rather than "attempt this hard problem," narrowing its search to simple tactic chains and existing Mathlib lemmas. This is exactly where the actual proof lives.

The advisor should deliberately calibrate difficulty framing to steer the search:
- "Elementary proof using existing Mathlib lemmas" → agent tries `exact?`, `simp`, short tactic chains
- "Standard techniques from [specific area]" → agent reaches for domain-specific tools
- "Follows from [specific lemma] and [specific lemma]" → agent has a concrete starting point

This makes problem.md (or the worker-visible version of it) an active **proof search guidance tool**, not just documentation. The advisor maintains the true problem.md with full context, and a sanitized version that frames the difficulty to steer worker behavior.

### The Cowboy Pattern
**Symptom:** Advisor writes code instead of delegating. Explore agent writes Lean.
**Cause:** Weak role enforcement on easy subtasks.
**Prevention:**
- Agent definitions explicitly forbid cross-role work
- Verify checks that explore output contains no Lean code
- Advisor output should only contain `bh create` commands, never code

### The Monolith Pattern
**Symptom:** Agent writes 300+ line proof that doesn't compile. Entire run wasted.
**Cause:** No intermediate compilation checkpoints.
**Prevention:**
- Formalize tasks scoped to single sorry holes
- `testCommand` gates every commit
- Branch-per-task preserves partial work on failure
- Advisor breaks large formalize tasks into smaller ones after failure

### The Hallucination Pattern
**Symptom:** Agent uses Mathlib lemma names that don't exist. Build fails repeatedly on "unknown identifier."
**Cause:** LLM training data has stale or incorrect Lean/Mathlib API knowledge.
**Prevention:**
- Formalize agent instructions: "NEVER guess lemma names. Use `exact?`, `apply?`, or grep Mathlib first."
- `lake env lean` with temp files for API discovery (documented as mandatory first step)
- After hallucination failures: advisor includes correct names in retry task description
- Future: integrate loogle/moogle tool for type-based Mathlib search

### The Regression Pattern
**Symptom:** Fixing one sorry breaks a previously proven lemma.
**Cause:** Editing shared files without compilation gate.
**Prevention:**
- `testCommand: "lake build"` on every commit
- Branch-per-task isolates changes
- Merge to main only after full build succeeds

## Comparison with Current Workflow

| Aspect | Current (math) | Proposed (math-research) |
|--------|---------------|--------------------------|
| Decomposition | Advisor plans upfront | Compiler generates goals + advisor spots connections |
| Proof strategy | Top-down only | Bidirectional (forward NL + backward Lean) |
| NL vs formal | Mixed in one role | Separated into explore + formalize |
| Verification | Verify agent reviews code | NL: verify agent. Formal: compiler |
| Literature | None | Shared `proofs/` directory |
| Error cost | High (failed Lean = wasted run) | Low (NL exploration is cheap, formalization is targeted) |
| Model usage | Same model does math + Lean | Cheap model explores, expensive model formalizes |
| Failure handling | Fail and rollback | Retry with feedback, branch preserves work |
| Difficulty info | Visible to all | Advisor only (information asymmetry) |
| Git strategy | Direct commit | Branch per task |

## Resolved Design Questions

1. **Should formalize agents create new `sorry` holes?** YES. As long as `lake build` passes. Each new sorry becomes a new task. This is the backward decomposition mechanism.

2. **How does the advisor extract sorry types?** Parse `lake build` warnings for sorry locations, then use `lake env lean` or read the source to get the goal type at each sorry.

3. **What if no forward result matches a backward goal?** Advisor translates the Lean goal type into mathematical language and creates an explore task targeting it specifically.

4. **Should explore agents read Lean goals?** NO. They work in pure math. The advisor translates between the two worlds. This prevents explore agents from getting confused by Lean syntax and keeps them focused on mathematical reasoning.

5. **How do we handle the NL→Lean translation gap?** The formalize role IS this translation. If a verified NL proof can't be formalized, it signals a gap the reviewer missed — verify gets a follow-up task to re-examine the proof with the specific Lean error as context.

6. **Parallel execution?** Forward and backward work are naturally parallel. Multiple explore tasks run simultaneously (cheap). Independent sorry holes can be formalized in parallel (expensive but isolated via branches).

## Implementation Plan

1. Create agent definitions (`explore.md`, `formalize.md`, `advisor.md`, `verify.md`)
2. Update `_preamble.md` with literature directory conventions and information asymmetry rules
3. Add `proofs/` directory scaffolding to template
4. Test on erdos-729 benchmark (known solution, not in training data)
5. Compare against current math workflow on same problem (controlled experiment)
