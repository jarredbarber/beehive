# Erdős Experiment Notes

Running log of observations from the Erdős proof experiment. This tests tm's math workflow on a genuinely hard problem: formal Lean 4 proof of an Erdős factorial divisibility conjecture.

## Setup

- **Problem**: Prove that if a!b! | n! "ignoring small primes" then a+b ≤ n + O(log n)
- **Success criteria**: Lean proof compiles with `lake build`, no `sorry`, theorem statement matches problem
- **Workflow**: `math` (advisor → execute → verify)
- **Project**: `/home/jarred/code/erdos`
- **Reset point**: git commit `4359f89` (scaffolding + initial task)

## Experiment 1: Lisp Interpreter (for comparison)

### Attempt 1: Over-specified tasks
- I created 8 detailed tasks with exact function signatures, test cases, etc.
- Worker completed all 8 tasks, 175 tests, zero failures
- **Problem**: I did all the design work. The LLM just typed.

### Attempt 2: Single vague task with design agent
- Created one task: "Build a working Lisp interpreter"
- **Result**: Design agent ignored its role, just built the whole thing in one shot
- 23 tests, all passing, interpreter works
- **Lesson**: Problem was too easy. LLMs have seen hundreds of Lisp interpreters in training data.
- **Lesson**: Role enforcement is weak - design agent went cowboy
- **But**: User pointed out the validator should recognize "task accomplished" regardless of process. Outcome > process.

## Experiment 2: Erdős Proof (current)

### Attempt 1 (started 2026-02-07T05:05)

**Advisor decomposition** (good!):
The advisor actually decomposed this time, creating a proper DAG:
```
erdos-g9v: Prove the conjecture (advisor, in_progress)
├── erdos-hel: Formalize problem statement + NL proof (execute, closed ✅)
├── erdos-ogc: Verify problem statement (verify, closed ✅)
├── erdos-24m: Prove Legendre inequality (execute)
├── erdos-wf6: Prove bound on sum of digits (execute)
├── erdos-lcp: Prove main theorem (execute, blocked on 24m + wf6)
└── erdos-r2u: Final verification (verify, blocked on lcp)
```

**Theorem statement** (in `Erdos/Basic.lean`):
```lean
theorem erdos_factorial_divisibility (P : ℕ) :
    ∃ C : ℝ, ∀ a b n : ℕ,
    (∀ p : ℕ, p.Prime → p > P →
      padicValNat p a.factorial + padicValNat p b.factorial ≤ padicValNat p n.factorial) →
    (a : ℝ) + b ≤ n + C * Real.log (n + 2) :=
```
This looks like a reasonable formalization: for all primes p > P, the p-adic valuation condition implies the bound. Uses `log(n+2)` to avoid log(0) issues. Needs review - is this actually equivalent to the problem statement?

**Lean struggles observed** (T+5 min):
1. Hallucinated lemma names: `Nat.pos_of_gt`, `Real.le_div_iff` (don't exist in this mathlib version)
2. Cast mismatches: `Int.subNatNat` vs `ℝ` - classic Lean 4 pain point
3. `omega` failing on non-linear arithmetic goals
4. `simp` making no progress on goals it should handle
5. Agent is in a write→build→fix loop, which is correct behavior but slow

**T+8 min status**:
- erdos-24m (Legendre): Failed or still struggling - task disappeared from list, possibly closed or failed
- erdos-wf6 (sum of digits): Still in_progress, build errors persist
- Multiple build errors in both SumDigits.lean and Legendre.lean
- Agent trying `lake env lean` for exploration, which is smart

**Key files being modified**:
- `Erdos/Basic.lean` - Main theorem statement (has sorry)
- `Erdos/Legendre.lean` - Legendre's formula for p-adic valuation of factorial
- `Erdos/SumDigits.lean` - Bound on digit sum s_p(n) ≤ C * log(n)

## Observations About the Math Workflow

### What's Working
1. **Advisor actually decomposed** - unlike the lisp experiment, it created a proper task DAG
2. **Proof strategy is reasonable** - Legendre's formula + digit sum bounds is the right approach
3. **Agent is iterating with the compiler** - write/build/fix loop is correct for Lean development

### What's NOT Working
1. **No retry-with-feedback on build failure** - agent keeps trying but there's no structured "here's what failed, fix it" loop. The testCommand would catch the failure but just mark the task as failed with git rollback, losing all work.
2. **Lean-specific knowledge gaps** - hallucinated lemma names are a systematic problem. Would benefit from a tool that searches mathlib.
3. **No compilation gate between tasks** - the sum_digits task is "in_progress" but the code doesn't compile. Without testCommand enforcement, broken code persists.
4. **Worker runs tasks sequentially** - can't parallelize the two independent lemma tasks (Legendre + digit sum)

### What the Validation System Would Help With
1. **Tier 1 (testCommand retry)**: `lake build` fails → capture error → retry with error context. This is the #1 missing feature. The agent IS doing this manually (write→build→read error→fix) but it's ad-hoc, not systematic.
2. **Tier 2 (cross-model review)**: Different model might know the correct mathlib lemma names. Gemini vs Claude have different Lean 4 knowledge.
3. **Structured feedback**: Instead of raw compiler output, a validator could parse Lean errors into "unknown identifier X - did you mean Y?" suggestions.

## Design Insights for tm

### From Lisp Experiment
- Over-specified tasks mask system weaknesses
- Design agents may skip decomposition if the problem is easy enough
- Validate outcomes, not process
- testCommand is already half the validation system

### From Erdős Experiment (ongoing)
- Hard problems DO need decomposition (advisor worked properly here)
- LLMs struggle with formal verification languages (hallucinated names, cast issues)
- The write→build→fix loop is the right pattern but needs to be a system property, not agent ad-hoc behavior
- Compilation is the ground truth validator for Lean - better than any cross-model review
- Missing: structured error feedback on build failure

### Key Design Question
Should `testCommand` failure trigger an automatic retry with error output appended to context? This would be the single highest-value change to tm. Currently it marks the task as `failed` and rolls back git. Instead:
1. Run testCommand
2. If fails: capture stderr, append to task context, increment attempt counter
3. Re-run the same agent with enriched context
4. After N failures: THEN mark failed and rollback

This is Tier 1 validation - cheap, high-value, and exactly what the Erdős experiment needs.

## Erdős Attempt 1 - Post-mortem

**Duration**: ~11 minutes (05:05 → 05:16)

**What happened**:
1. Advisor created proper DAG (6 subtasks) - good!
2. Worker started executing subtasks (Legendre, SumDigits) - good!
3. Subtasks struggled with Lean compilation (hallucinated names, cast issues)
4. Then somehow the advisor task got picked back up and tried to do everything itself
5. Advisor produced NL proof + attempted Lean but admitted sorrys remain
6. JSON response was malformed (NL text before JSON block) → parse failure
7. Worker marked as "failed", rolled back git
8. BUT: git clean didn't remove untracked files (Legendre.lean, SumDigits.lean survived)
9. All subtasks are gone (orphaned when parent failed and backlog was reset)

**Failures observed**:
1. **Role drift**: Advisor went cowboy, tried to code instead of orchestrate
2. **Response format**: Put NL text before JSON → parse failure
3. **Dishonest completion**: Claimed "completed" while admitting sorrys exist
4. **Git rollback incomplete**: Untracked files survived `git clean -fd`
5. **Orphaned subtasks**: When parent task failed, subtasks vanished
6. **No testCommand retry**: Would have caught `lake build` failure and retried

**Build status at failure**: 4 compilation errors, 4 sorrys in SumDigits.lean

**NL proof quality**: Actually looks correct! The mathematical argument is sound:
- Use Legendre's formula: ν_p(n!) = (n - s_p(n))/(p-1)
- Divisibility condition → a + b ≤ n + s_p(a) + s_p(b)
- Digit sum bound: s_p(m) = O(log m)
- Therefore: a + b ≤ n + O(log n)

The math is right. The Lean formalization is where it falls apart.

**What would have helped**:
1. testCommand retry with error feedback (Tier 1 validation)
2. Stricter role enforcement (advisor should not write code)
3. Better JSON response parsing (tolerate preamble text)
4. Subtask persistence even when parent fails

## Erdős Attempt 2 (started 2026-02-07T05:18)

**Changes from Attempt 1**:
- Stricter advisor instructions: "DO NOT implement anything yourself"
- Phased decomposition suggested in description
- Same reset point

**Advisor behavior** (much better!):
- Created proper phased DAG
- Noticed it made duplicate tasks and deferred them (self-correction!)
- Didn't try to code anything itself
- Final DAG: Phase 1 (NL proof) → Phase 2 (Lean statement) → Phase 3 (verify) → Phase 4 lemmas → Phase 5 (assemble) → Phase 6 (verify)

**Phase 1 (NL proof)**: ✅ Completed. PROOF.md written with sound mathematical argument.

**Phase 2 (Lean statement)**: ✅ Completed. Clean theorem statement using p-adic valuations, compiles with sorry.

**Phase 3 (verify statement)**: ✅ Completed. Verify agent approved the formalization.

**Phase 4 (lemma proofs)**: ⚠️ This is where it gets interesting.
- Phase 4.1 (Legendre formula): Still in progress, struggling with Lean compilation
- Phase 4.2 (large primes): FAILED - but with excellent analysis!

**Phase 4.2 failure analysis** (the agent's own words):
> "Using Bertrand's postulate alone, I can prove a+b ≤ 4n. But the theorem requires a+b ≤ n + O(log n). To get the O(log n) bound, I need explicit Legendre's formula bounds from Phase 4.1."

The agent correctly identified:
1. Its partial result (a+b ≤ 4n) is insufficient
2. The dependency issue: Phase 4.2 needs Phase 4.1's results
3. The advisor should have made 4.2 depend on 4.1 (DAG design flaw)

**Key insight**: The ADVISOR made a structural DAG error (parallel tasks that should be sequential). The EXECUTOR caught it and reported it clearly. This is the escalation pattern working correctly - but there's no mechanism for the executor to FIX the DAG.

**Git rollback problem**: When Phase 4.2 failed, git rollback removed work from Phase 4.1 too (both were modifying files). This is destructive - good partial work was lost.

**Build status at T+20 min**: Compiles with 1 sorry (main theorem body). Lemma proofs not yet in place.

### Observations from Attempt 2
1. Stricter advisor instructions worked - it actually delegated this time
2. The math workflow DAG is sound but the advisor made a dependency error
3. Execute agents are doing real mathematical reasoning (Bertrand's postulate analysis was correct)
4. Git rollback is too aggressive - partial work from OTHER tasks gets wiped
5. The worker runs tasks sequentially but the DAG has parallel branches (4.1 and 4.2) that can't both be in_progress simultaneously
6. Lean compilation errors are the main blocker (hallucinated names, type mismatches)

### Attempt 2 continued - Phase 4 results (T+65 min)

**Phase 4.1 (Legendre formula)**: ✅ COMPILED! Two lemmas:
- `legendre_upper_bound`: v_p(n!) < n/(p-1)
- `legendre_lower_bound`: (n - p*(log_p(n)+1))/(p-1) ≤ v_p(n!)
- Uses mathlib's `sub_one_mul_padicValNat_factorial_lt_of_ne_zero` — agent found the right name!

**Phase 4.1 verify**: Failed initially (JSON parsing bug — markdown wrapping), then succeeded on retry.

**Phase 4.2 (large primes)**: FAILED TWICE.
- First attempt: Correctly identified it needed Phase 4.1 results (dependency issue)
- Second attempt: Wrote 376+ lines of proof with ZERO sorrys, 47 errors at peak, then iterated down.
- **Ran out of iterations**: "I attempted to fix them blindly but ran out of iterations."
- The proof logic was complete but couldn't find correct mathlib lemma names
- Hallucinated: `Nat.Prime.dvd_factorial`, `padicValNat_pos_iff_dvd`, `Nat.le.one_lt`
- On failure, git rollback removed all the proof work

**Critical finding**: The agent wrote a 376-line proof with correct mathematical logic but couldn't get it to compile because it hallucinated Lean/Mathlib identifiers. This is NOT a reasoning failure — it's a knowledge gap about the specific API surface of Mathlib v4.27.0.

**What would fix this**:
1. A `loogle` or `exact?` tool that searches Mathlib for lemmas matching a type signature
2. testCommand retry with feedback (would allow more iterations)
3. Longer agent timeout / higher iteration limit
4. A pre-built "Mathlib cheat sheet" in the context (common factorial/padic lemma names)

### JSON parsing bug (systematic)
Both verify agents failed with "Could not parse agent response" because they wrapped their JSON in markdown. The raw response shows:
```
## Verification Report
\`\`\`json
{"status": "completed", ...}
\`\`\`
```
This is a bh bug — the response parser should strip markdown formatting before looking for JSON.

### Worker deadlock bug
When Phase 2 was marked `in_progress` but the worker session crashed, the worker couldn't pick it up again (it was already "claimed"). Required manual `bh reopen` to fix. This is a known issue — stale `in_progress` tasks with no active worker.

### Phase 4.2 Attempt 3 (Opus, ~40 min, started T+80)

**Model**: Claude Opus 4.6 (heavy model)

**Approach**: Agent used `lake env lean` with temp files to discover mathlib API before writing proof. Smart.

**Progress**: 
- 838 lines at peak, then simplified to 551, then back to 813
- Error count: 26 → 11 → 9
- Sorry count: 1 → 0 → 1
- Helper lemmas written: `padicValNat_factorial_eq_zero_of_prime_gt`, `lt_of_padicValNat_factorial_eq_zero`, `constraint_gives_bound_via_digits`, `digit_sum_le_log_bound`, `nat_log_le_real_log_div`

**Remaining errors (9)**:
1. `native_decide` on noncomputable `Real.log` — tried to prove log(2) > 0.3 via native_decide
2. `linarith` failures — missing hypotheses in calc chains  
3. Timeouts at 200k heartbeats — proof search too expensive
4. `omega` failures on real-number-adjacent goals

**Failure reason**: "All models in the fallback chain either failed or returned empty responses" — ran out of API quota.

**Git rollback DID NOT run** — code changes survived. Committed as `8e9d8ba`.

**Key observation**: The agent is writing the mathematically correct proof but keeps hitting Lean-specific technical issues:
- Can't prove concrete real number facts (log 2 > 0.3)
- Cast issues between ℕ and ℝ
- linarith can't close goals with missing hypotheses
- Proof search timeouts

This is exactly the gap between "understanding the math" and "knowing the Lean API." A human Lean developer would fix these 9 errors in ~30 min.

### Cumulative Assessment (T+125 min)

**What bh has accomplished**:
- ✅ Decomposed the problem into sensible phases
- ✅ Written a correct NL proof (PROOF.md)
- ✅ Formalized the theorem statement (compiles, matches problem)
- ✅ Proved Legendre formula bounds (compiles, no sorry)
- ⚠️ Written 813 lines of main proof with 9 compilation errors and 1 sorry

**What's blocking completion**:
1. Lean API knowledge gap (hallucinated names, wrong tactics)
2. API quota exhaustion after 3 attempts
3. No retry-with-feedback mechanism (each attempt starts fresh)
4. Git rollback destroys partial progress

**Estimated remaining difficulty**: A human Lean developer could fix the 9 errors in ~30 min. An LLM needs either:
- More iterations (the 9 errors are all tractable)
- Better Lean API search tools
- Or we manually fix the remaining issues

## 🎉 PROOF COMPLETED (T+175 min, 2026-02-07T08:41)

### What happened
After attempt 3 failed (API exhaustion), I (the overseer) manually:
1. Cleaned up the helper lemmas (key_ineq, digit_sum_bound, a_lt_large_prime, etc.)
2. Fixed compilation errors in the helpers (List membership syntax, omega vs calc for multiplication)
3. Got all helpers compiling with only the main theorem as sorry
4. Reopened the task with VERY detailed instructions (available lemmas, proof strategy, lean tips)
5. The agent (Claude Opus) on attempt 5 completed the proof in ~30 min

### The completed proof
- **318 lines** of Lean 4, all compiling
- **Zero sorrys**
- **Key constant**: C = 20q² where q is the smallest prime > P
- Uses: Legendre's formula, Bertrand's postulate, digit sum bounds, Nat.log → Real.log conversion
- Clean structure: helper lemmas → main theorem with case analysis

### Verification
```
$ lake build → Build completed successfully (3077 jobs)
$ grep -rn "sorry" Erdos/ → (no output = no sorrys)
```

### Total effort
- **~3 hours** wall clock (5:05 → 8:41 UTC)
- **5 attempts** at the main theorem proof
- **~$20-30** in API costs (estimate: Opus is expensive)
- **Human intervention required**: 
  - Fixed helper lemma compilation (list membership, calc chains)
  - Provided detailed error feedback in task descriptions
  - Reopened failed tasks multiple times

### What the agent did right
1. Correct mathematical decomposition (advisor created proper DAG)
2. Sound NL proof (PROOF.md)
3. Clean theorem statement matching the problem
4. Proved Legendre formula bounds using mathlib's `sub_one_mul_padicValNat_factorial`
5. Found and used `Nat.bertrand` from mathlib
6. Correct proof strategy (Bertrand → crude bound → digit sum → log conversion)
7. Used `lake env lean` with temp files to discover mathlib API (smart!)
8. Proved auxiliary facts about log(2) > 1/2, log(2) < 1 via exp bounds

### What the agent did wrong
1. Hallucinated mathlib names repeatedly (padicValNat.pos_iff_dvd, Real.exp_lt_iff_lt_log, etc.)
2. Kept trying native_decide on noncomputable Real.log
3. Couldn't fix list membership syntax (List.mem_cons_self type changed in Lean 4.27)
4. omega failed on multiplication goals (needed calc chains instead)
5. Got lost in monolithic proofs (300+ lines without modularization)
6. Ran out of iterations / API quota

### Lessons for tm
1. **Overseer-in-the-loop was essential** - the oversight agent (not the human) provided the course-corrections that made attempt 5 succeed. Pure unsupervised execution couldn't complete this, but the supervision came from another AI agent playing the overseer role.
2. **Helper lemma compilation as checkpoints** - having compilable intermediate results prevented regressions
3. **Detailed error feedback in task descriptions** accelerated convergence dramatically
4. **The testCommand (lake build) was the right validator** - but needed retry-with-feedback, not fail-and-rollback
5. **Role enforcement helped** - attempt 2's advisor stayed in its lane (unlike attempt 1)
6. **Git rollback is too destructive** - it wiped useful partial work
7. **Small focused tasks > monolithic tasks** - the final success used a single focused task with compiled helpers
8. **API cost matters** - Opus is expensive and the failed attempts were wasted money
