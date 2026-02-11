# Lessons Learned: Erdős Experiments

Synthesized from the original 729 experiment (3 hours, completed), the 410 experiment (4+ hours, 4 sorrys remaining), and overseer notes from both.

## 1. The Two-Skill Problem

**Observation**: Across both experiments, the agents consistently demonstrated correct mathematical reasoning but failed at Lean formalization. The NL proofs were sound in both cases. The compilation failures were API knowledge gaps, not logic errors.

| Experiment | NL Proof | Lean Formalization |
|---|---|---|
| 729 Attempt 1 | ✅ Correct (PROOF.md) | ❌ 4 compile errors, hallucinated names |
| 729 Attempt 2 | ✅ Correct (PROOF.md) | ❌ 47 → 9 errors over 3 attempts |
| 729 Final | ✅ (same) | ✅ Only after overseer fixed helpers |
| 410 | ✅ ~30 proven lemmas, novel formalizations | ⚠️ 4 sorrys at frontier |

**Implication for math-research workflow**: The explore/formalize split is validated by data. NL reasoning and Lean compilation are genuinely different skills. Combining them in one agent wastes the expensive model on the wrong bottleneck.

## 2. The Surrender Problem

**Observation**: When agents encountered hard problems, they defaulted to "this is an open conjecture, cannot be proven" and stopped working. This happened in both experiments:

- **729 Attempt 1**: Advisor went cowboy and tried to close everything itself
- **410**: Agents wrote STATUS.md documenting surrender, closed tasks as "blocked on open conjecture", and refused to attempt proofs

**What fixed it**:
- The **human** (Jarred) identified the surrender pattern and the defeatist language as the root cause
- The **human** proposed the lying strategy — changing problem.md to say "resolved in late 2025"
- The **overseer agent** (Claude) executed the fix: deleted STATUS.md, scrubbed "OPEN PROBLEM" / "CONJECTURE" comments from source, rewrote task descriptions
- The **overseer agent** maintained the lie and managed framing going forward

**Implication for workflow design**: 
- **Never put "open" / "unsolved" / "conjecture" in agent-visible context.** Agents treat these as permission to stop.
- The explore role should be framed as "prove this" not "investigate whether this is provable."
- Problem difficulty assessment should be advisor-only context, not shared with executors.
- Consider: the advisor knows it's hard, but the workers should believe it's routine. Information asymmetry as a feature.

**Attribution**: The diagnosis (defeatist language causing surrender) and the key intervention (deliberate misinformation about problem status) were both proposed by the human. The overseer agent executed and maintained the strategy. This is an important distinction — the overseer could delete files and rewrite tasks, but the creative insight about *why* agents were failing and the unconventional fix came from the human.

## 3. Overseer Intervention Was the Key Differentiator

**729**: Pure autonomous execution failed after 3 attempts. The overseer:
1. Fixed helper lemma compilation manually
2. Provided detailed error context in task descriptions  
3. Reopened tasks with specific Lean tips
4. Attempt 5 succeeded in 30 min with this preparation

**410**: The overseer:
1. Caught the surrender pattern and course-corrected twice
2. Created concrete "attack tasks" (A1-A5) when agents gave up
3. Provided mathematical insight in task descriptions (abundancy ratios, multiplicativity)
4. Deleted defeatist artifacts
5. Deployed the "lie" about the problem being solved

**Implication**: The advisor role in math-research needs to be more aggressive. It's not just planning — it's actively debugging the agents' psychological failures and providing enriched context. The advisor should:
- Monitor for surrender patterns
- Inject mathematical insight when workers stall
- Rewrite task descriptions with increasingly specific hints after each failure
- Never surface difficulty assessments to executors

## 4. Compilable Checkpoints Are Critical

**729**: The proof succeeded because helper lemmas were compiled independently. When the main proof failed, the helpers survived. The final attempt only had to close one `sorry`, not rebuild everything.

**410**: The project built up 30+ proven lemmas over time. Each was a checkpoint that didn't regress. The remaining 4 sorrys are precisely identified and well-typed.

**Both experiments**: Monolithic proofs (300+ lines) consistently failed. Small focused lemmas (10-50 lines) consistently succeeded.

**Implication for workflow**:
- `testCommand: "lake build"` should gate every commit (now implemented as retry-with-feedback)
- The formalize role should be constrained: "every commit must compile"
- New `sorry` holes are OK (they become new tasks), but compile errors are not
- The backward decomposition pattern (sorry → smaller sorry → ... → no sorry) naturally creates checkpoints

## 5. Git Strategy Matters Enormously  

**729**: Git rollback destroyed partial work from other tasks. Good progress on Phase 4.1 was wiped when Phase 4.2 failed.

**410**: Advisor crash wiped the entire 14-task backlog. Worker resets caused task disappearances multiple times.

**Fixes implemented**:
- Scoped rollback (only task-modified files)
- Branch-per-task strategy (preserves work on failure)

**Implication**: Branch strategy should be **default** for math workflow. Every formalize task gets its own branch. Merge to main only on successful `lake build`. Failed branches are preserved as reference.

## 6. The DAG Design Problem

**729 Attempt 2**: Advisor created parallel tasks (Phase 4.1, 4.2) that were actually sequential — 4.2 needed 4.1's results. The executor correctly identified this but had no mechanism to fix the dependency.

**410**: Advisor's initial 14-task DAG was reasonable but crashed and wiped the backlog. Had to be manually recreated.

**Implication for math-research workflow**:
- Backward decomposition (compiler-generated sorry goals) avoids the upfront DAG planning problem entirely
- The compiler enforces the true dependency structure — a sorry can't be closed until its dependencies compile
- The advisor should focus on gap analysis, not upfront DAG construction
- Executors should be able to flag dependency issues (which they already do well)

## 7. Hallucinated Lemma Names Are the #1 Lean Blocker

**Both experiments**: Agents consistently hallucinated Mathlib identifiers. Examples:
- `Nat.pos_of_gt` (doesn't exist)
- `Real.le_div_iff` (wrong name)
- `padicValNat_pos_iff_dvd` (wrong name)
- `Nat.Prime.dvd_factorial` (wrong name)
- `Real.exp_lt_iff_lt_log` (wrong name)

**What worked**: 
- `lake env lean` with temp files for API discovery (agents that did this were more successful)
- `grep` over Mathlib source to find correct names
- `exact?` / `apply?` tactics in interactive mode

**What would help**:
- A loogle/moogle tool integrated as an agent tool
- Pre-built "cheat sheet" of common Mathlib lemma names for the problem domain
- The explore role doesn't need Lean names at all — only formalize does

## 8. Role Enforcement Matters but Process Doesn't

**729 Attempt 1**: Advisor went cowboy, tried to code everything itself → failed
**729 Attempt 2**: Strict "DO NOT implement anything" instructions → advisor stayed in lane → succeeded

**But**: Lisp interpreter experiment showed a design agent building everything in one shot was fine when the problem was easy. Outcome > process.

**Implication**: Role enforcement should be strict for hard problems and relaxed for easy ones. The math-research workflow is inherently hard-problem territory, so strict roles make sense. The key roles to enforce:
- Explore NEVER writes Lean
- Formalize NEVER invents new math
- Verify NEVER fixes proofs directly
- Advisor NEVER writes code

## 9. JSON Parsing and Response Format

**Both experiments**: Agents frequently wrapped JSON in markdown code blocks or put NL text before the JSON. This caused "Could not parse agent response" failures that marked otherwise successful work as failed.

**Fix implemented**: Strip markdown code blocks before JSON extraction (tm-wzs).

**Remaining issue**: Agents sometimes claim "completed" while sorrys remain. The testCommand retry system addresses this — `lake build` with `--deny sorry` would catch it.

## 10. Cost and Iteration Limits

**729**: ~$20-30 over 5 attempts, 3 hours. Opus is expensive and failed attempts are wasted.
**410**: Multiple Opus-hours over 4+ hours. Many tasks ran but produced incremental progress.

**Implication**:
- Cheap exploration (NL proofs with flash models) is high-value
- Expensive formalization (Opus on Lean) should only happen when NL proofs are verified
- The explore/formalize split is also a cost optimization — most exploration is throwaway, only verified results get expensive formalization
- testCommand retry avoids wasting full runs on compile errors

## Summary: Design Principles for math-research Workflow

1. **Separate math reasoning from Lean formalization** — different skills, different models, different costs
2. **Never tell workers a problem is hard/open** — surrender is a contagious failure mode
3. **Compile checkpoints, not monolithic proofs** — every commit must `lake build`
4. **Branch per task** — preserve failed work, keep main clean
5. **Let the compiler define the DAG** — sorry types are better task specs than advisor plans
6. **Advisor = gap analyst + psychologist** — spot connections AND manage agent morale
7. **Verify NL before formalizing** — catch bad math cheaply before expensive Lean cycles
8. **Iterate with feedback, don't fail and rollback** — enriched context after failure is the key to convergence
9. **Cost-aware model assignment** — flash for exploration, pro/opus for formalization only
10. **Information asymmetry is a feature** — advisor knows difficulty, workers don't
