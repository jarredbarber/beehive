# Lessons Learned: Erdős 1094 Experiment

28 tasks, 0 failures, ~4 hours to main theorem closure. 2 citation sorrys remaining.

## What Worked

### 1. Overseer as Context Sanitizer (Heartbeat #3)

The explore agent's first output included a "Difficulty Assessment" section rating everything "Hard" and labeling the problem an "open conjecture." The overseer caught this at heartbeat #3 and immediately:
- Deleted the difficulty table
- Reframed "Identified Gaps" as "Remaining Proof Components"
- Changed "rigorous bound" to just "bound" (removed hedging language)

This happened *before* any other agent saw the file. Without this intervention, every downstream agent would have inherited the "this is Hard" framing. The explore agent also used "open conjecture" language in its thinking blocks but never in output files — the overseer noted this but didn't intervene since thinking blocks aren't visible to other agents.

**Workflow implication:** The overseer should have an explicit "sanitize" step after explore tasks complete. Currently this happens ad hoc when the overseer notices defeatist language.

### 2. Advisor Created a Beautiful DAG (Heartbeat #4)

The advisor task (`erdos1094-1k9`) read the sorry, the exploration, and the dead-ends, then produced 19 tasks with correct dependency structure in a single pass:
- 7 explore tasks (specific mathematical statements, not "investigate")
- 7 verify tasks (one per explore proof)
- 5 formalize tasks (properly blocked behind verify)
- Two parallel branches: k≥29 and k≤28

All task descriptions used action verbs ("Prove:", not "Investigate:") with precise statements. No difficulty exposure, no "open problem" language. This was the highest-leverage single task in the project.

**Workflow implication:** The advisor role is critical for DAG quality. The initial explore→advisor→pipeline pattern should be the standard opening for math-research projects.

### 3. Verify→Revise Cycle Caught Real Errors (Heartbeats #9-#13)

All three core proofs (CRT density, large-n divisibility, k≤28 bound) had the same gap: a density argument showing "expected count < 1" was used to claim "count = 0." The verify agents caught this every time:
- CRT density: "density < 1 doesn't guarantee count = 0" → revision task
- Large-n: same gap in Section 7 → revision task  
- k≤28: same pattern → revision task

All three revisions succeeded on the first attempt. The verify agents also correctly approved the Kummer and large-prime criterion proofs which had no gaps.

**Workflow implication:** The verify role earns its cost. The density→count gap would have propagated to formalization and caused failures there (harder to debug). Catching it at the NL level is much cheaper.

### 4. native_decide for Finite Verification (KLe28.lean)

The formalize agent for k≤28 discovered it could verify 2810 cases (k ∈ [17,28], n ∈ [285,k²]) using `native_decide`. This was not suggested in the task description — the agent figured out the approach independently. The key insight: for these ranges, C(n,k) always has a small prime factor (typically 2 or 3), so `native_decide` computes minFac quickly via trial division.

**Workflow implication:** Formalize agents can be creative about proof strategies. The task description should specify *what* to prove, not *how*. The `native_decide` approach is worth mentioning as a standard technique in the formalize agent prompt for finiteness results.

### 5. Formalize Tasks Were Fast Once NL Proofs Were Verified

Both Kummer and LargePrime formalizations completed in one heartbeat period (~15 min each). No hallucinated lemma names, no monolith patterns. The agents used `grep` and `exact?` to discover Mathlib API before writing proofs. The compile-often guidance in the workflow seems to be working.

## What Needs Improvement

### 1. DAG Gaps After Revision Cycles

The overseer had to manually fix 3 DAG gaps where revision tasks had no downstream re-verify tasks. When verify→revision happens, the original verify task closes, but no one creates a new verify task for the revised proof. The proofs would have been stranded at "Under review" forever.

**Fix:** The verify agent should automatically create a re-verify task when it requests revision. Or: the worker should detect "revision requested" closures and auto-create follow-up verify tasks.

### 2. Role Boundary Violations

- Explore agent used Python for computational exploration (heartbeat #1). The explore role says "Write any code (Lean, Python, or otherwise) is forbidden." But the computation was productive and informed the proof strategy.
- Explore agent (revision task tg2) wrote Python code in proofs/bound-n-for-small-k.md appendix. The task description offered "provide code" as an option, which shouldn't have been there.

**Fix:** The explore role prohibition on code is too strict for math-research. Computational exploration (Python for enumeration, finding patterns) is a natural part of mathematical reasoning. Consider allowing Python in explore tasks but not Lean (which is the formalize agent's job). Update the workflow: "Explore agents may use computation (Python, etc.) for investigation but must not write Lean code."

### 3. Bottleneck: Sequential Worker on Long Tasks

The CRT density explore task ran for 65 minutes, blocking all other work. 13 tasks were waiting. A parallel worker system would have allowed the n>k² and k≤28 tasks to proceed simultaneously.

**Evidence for parallel workers:** During the 65-minute CRT bottleneck, 5 tasks were unblocked and waiting: n>k² explore, k≤28 explore, combine k≥29 explore, Kummer formalize, large-prime formalize. All were independent. With 3 workers, the project could have completed ~1 hour faster.

### 4. Explore Produces Reports, Not Proofs

The first explore task produced a 17KB analysis document instead of a proof. The overseer had to intervene and create an advisor task to decompose it into proper tasks. This is the "report pattern" — agents trained to be helpful produce comprehensive analyses rather than targeted proofs.

**Fix:** The explore task description and role prompt should be more explicit: "Your output is a PROOF FILE in proofs/*.md, not an analysis or report. The file must contain a specific theorem statement and a step-by-step proof." The initial seed task should be an advisor task, not an explore task.

### 5. Citation Sorrys Need a Closing Path

The 2 remaining sorrys (`crt_small_prime_divides` and `large_n_minFac_bound`) are backed by verified NL proofs but require either:
- Massive `native_decide` computation (CRT for all k ≥ 29)
- A structural Lean argument that avoids case enumeration

The current formalize tasks (`erdos1094-lth`, `erdos1094-u4e`) are attempting this but may fail. There's no escalation plan if they do. The CRT sorry in particular may be fundamentally hard to close without extending `native_decide` to very large ranges.

**Observation:** The gap between "verified NL proof" and "compiling Lean proof" is wider for computational arguments than for structural ones. A density/enumeration argument that works in NL may require enormous computation in Lean. The workflow should distinguish between "structurally formalizable" and "computationally formalizable" NL proofs.

## Metrics

| Metric | Value |
|--------|-------|
| Total tasks | 28 |
| Failed tasks | 0 |
| Total runtime | ~4 hours |
| Sorrys closed | 1 (main theorem) |
| Sorrys remaining | 2 (citation-level, backed by verified NL) |
| Lean files | 5 (445 lines total) |
| Sorry-free Lean files | 3 of 5 |
| NL proofs verified | 7 |
| NL proofs revised | 3 (all succeeded on first revision) |
| Overseer heartbeats | 16 |
| Manual interventions | 3 (sanitize, create advisor, fix DAG gaps ×3) |
| Formalize success rate | 100% (5/5 tasks produced compiling code) |
| Verify accuracy | 100% (caught all 3 density→count gaps, approved 4 correct proofs) |
