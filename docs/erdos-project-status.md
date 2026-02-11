# Erdős Problem Project Status

**Last updated:** 2026-02-09 (evening)

## Overview

These are autonomous agent proof attempts at Erdős problems, using the [tm (beehive)](https://github.com/jarredbarber/beehive) task management system. All mathematics — NL proofs, proof strategies, and Lean formalizations — is agent-generated. Human involvement is limited to project setup, task seeding, and occasional strategic intervention (e.g., decomposing stuck tasks, forcing agents to abandon dead-end approaches).

All Lean code targets Lean 4.27.0 with Mathlib 4.27.0. All projects are public on GitHub.

---

## Summary Table

| Project | Problem | Model | Lines | Sorrys | Axioms | Status |
|---------|---------|-------|-------|--------|--------|--------|
| erdos-729 | 729 | Claude | 318 | 0 | 0 | ✅ **Complete** |
| erdos-729-google | 729 | Gemini | 304 | 1 | 0 | ⚠️ Worker active, casting DAG |
| erdos-1094 | 1094 | Claude | 1014 | 7 | 0 | ⚠️ Worker stopped, 1 task stale |
| erdos-1094g | 1094 | Gemini | 1452 | 2 | 9 | 🔴 Worker dead, backlog empty |
| erdos-410-v2 | 410 | Claude→Gemini | 1152 | 1 | 2 | 🟡 Blocked on open math (ratio_divergence) |
| erdos-410 | 410 | Claude (V1) | 1544 | 8 | 0 | 🔴 Abandoned (control experiment) |

---

## Erdős Problem 729 ✅

**Problem:** If $a! \cdot b! \mid n!$ "ignoring small primes" (i.e., $\nu_p(a!) + \nu_p(b!) \leq \nu_p(n!)$ for all $p > P$), then $a + b \leq n + O(\log n)$.

**Reference:** [erdosproblems.com/729](https://www.erdosproblems.com/729)

### Relationship to Problem #728

Problem 728 (full divisibility: $a!b! \mid n! (a+b-n)!$) was resolved by GPT-5.2 + Aristotle (Harmonic), written up by Sothanaphan et al. in arXiv:2601.07421. That paper notes 728 is "a more precise version of #729. The same examples work." Since full divisibility (728) implies large-prime divisibility (729), solving 728 automatically resolves 729.

However, 729 admits a much simpler **direct** proof via Legendre's formula and a single large prime. Both our agents independently found this direct proof without knowing about the arXiv paper. See `erdos-729/proof-comparison.md` for detailed analysis.

**Note on problem selection:** The human picked 729 without realizing it was related to 728 or that it had a known simple proof. This is a consequence of the "strategic ignorance" experimental design — see Observation 11 in `anthropology-erdos-410.md`.

### Project: erdos-729 (Claude) — ✅ Complete

**Model:** Claude  
**Status:** 318 lines, 0 sorrys, 0 axioms. `lake build` passes. **Done.**

**Strategy:** Fix prime $q > P$ via `exists_infinite_primes`. Apply Legendre's formula to get $a + b \leq n + S_q(a) + S_q(b)$. Bound digit sums by $O(\log n)$. Case split: small $n$ uses Bertrand's postulate, large $n$ uses digit sum bounds directly. Constant $C = 20q^2$.

**Effort:** ~3 hours wall clock, 5 attempts at main theorem, 16 tasks total.

### Project: erdos-729-google (Gemini) — ⚠️ In Progress

**Model:** Gemini 3 Pro High  
**Status:** 304 lines across 2 files, 1 sorry (main theorem assembly), 0 axioms. `lake build` passes. Worker active on decomposed casting DAG.

**Strategy:** Same core idea (Legendre + digit sum bounds), but with a novel `log_bound` lemma that abstracts the self-referential bound $a \leq n + K \log a \implies a \leq n + C' \log n$. All supporting lemmas proved; stuck on Nat↔ℝ casting in final assembly.

**Previous attempt:** Worker died after 63 build attempts in a casting death spiral. We decomposed the remaining work into 4 focused tasks:
1. `erdos729go-8rj` — Cast `core_inequality` to ℝ (✅ closed)
2. `erdos729go-lut` — Prove `a < p` when `p > n` (🔄 in progress)
3. `erdos729go-sz1` — Combine bounds in ℝ (blocked on 8rj)
4. `erdos729go-0h2` — Assemble final proof from ℝ-typed lemmas (blocked on all)

**The Nat↔ℝ casting problem:** In Lean 4, ℕ and ℝ are disjoint types. Subtraction semantics differ (ℕ truncates, ℝ doesn't), casts don't distribute automatically, and `linarith` can't cross types. The proof naturally lives half in ℕ (combinatorial facts) and half in ℝ (logarithmic bounds), and Lean forces explicit bridging at every crossing. The decomposed DAG isolates casting into small focused tasks.

---

## Erdős Problem 1094 ⭐

**Problem:** For all $n \geq 2k$, the least prime factor of $\binom{n}{k}$ is at most $\max(\lfloor n/k \rfloor, k)$, with only finitely many exceptions.

**Reference:** [erdosproblems.com/1094](https://www.erdosproblems.com/1094)  
**Origin:** Conjectured by Erdős, Lacampagne, and Selfridge (1988). Listed as **open** on erdosproblems.com.

**Formal statement:**
```lean
theorem erdos_1094 :
    {(n, k) : ℕ × ℕ | 0 < k ∧ 2 * k ≤ n ∧ (n.choose k).minFac > max (n / k) k}.Finite
```

The conjecture specifies exactly 14 exceptions. Both agent projects identified the same 14 pairs, matching ELS88.

### Project: erdos-1094 (Claude) — [GitHub](https://github.com/jarredbarber/erdos-1094)

**Model:** Claude  
**Status:** Main theorem structure proved. 7 sorrys remaining, 0 axioms. 1014 lines Lean, compiles. 35 tasks (34 closed, 1 stale in_progress). Worker stopped.

The main theorem `erdos_1094` compiles with no sorry at the top level — it shows the exceptional set is contained in $\{(n,k) : n < 285, k < 29\}$, which is finite. Sub-lemmas have sorrys backed by verified NL proofs.

**Proof architecture:** Two branches.
- **k ≥ 29** (`KGe29.lean`): CRT density analysis (3 sorrys)
- **k ≤ 28** (`KLe28.lean`): Large-n argument + exhaustive verification via `native_decide` (4 sorrys, including `smallPrimeDivCheck` computational assertions)

**Stale task:** `erdos1094-ttp` (close 4 sorrys in KLe28.lean) — in_progress but worker stopped.

### Project: erdos-1094g (Gemini) — [GitHub](https://github.com/jarredbarber/erdos-1094g)

**Model:** Gemini 3 Pro High  
**Status:** 2 sorrys, 9 axioms remaining. 1452 lines Lean across ~10 files, compiles. 68 tasks closed, backlog empty. Worker dead.

Gemini took a different approach: cite published literature as axioms, focus on the architectural reduction. All 14 exceptions explicitly enumerated as a `Finset`, verified computationally with `native_decide`.

**Axioms (9):**
- 4 analytic bounds (`AnalyticBounds.lean`): Mertens-type prime sum bounds, prime counting function bounds (Rosser-Schoenfeld/Dusart)
- 1 Ecklund bound (`Ecklund.lean`): Case 1 for k ≥ 12
- 2 EES sieve bounds (`EES1974.lean`, `EESAnalytic.lean`): Intermediate gap analysis
- 1 Sylvester-Schur (`Sylvester.lean`): Classical result (published 1892)

**⚠️ Citation axiom audit (see [axiom-audit-1094.md](axiom-audit-1094.md)):** Human review found 2 of the original 3 citation axioms were overstated. Agents replaced those with computational proofs, but introduced more axioms for analytic bounds. A Gemini verify agent audited the axioms and **approved all three** originals — demonstrating that agents cannot reliably verify factual claims about external literature.

**Sorrys (2):** Both in `EESAnalytic.lean` — `Real.log x > 2` for large x, and a base case computation.

### Comparison

| | Claude (erdos-1094) | Gemini (erdos-1094g) |
|---|---|---|
| Lines of Lean | 1014 | 1452 |
| Sorrys | 7 | 2 |
| Axioms | 0 | 9 |
| Strategy | Prove from first principles | Cite literature → formalize architecture |
| Tasks | 35 (0 failed) | 68 (0 failed) |
| Key strength | No axioms — everything compiler-verified | Complete architectural reduction |
| Key weakness | Sorrys in CRT density + computational cases | 9 citation axioms (some known overstated) |

**Assessment:** Claude has the cleaner proof (no axioms) but more sorrys. Gemini has fewer sorrys but relies on 9 axioms, some of dubious provenance. Neither has reached zero sorrys + zero axioms. The analytic bounds axioms (Rosser-Schoenfeld, Dusart, Mertens) are legitimate published results that shouldn't be wasted time proving from scratch — the project value is in the combinatorial argument.

---

## Erdős Problem 410

**Problem:** Let $\sigma_1(n) = \sigma(n)$ be the sum of divisors, and $\sigma_k(n) = \sigma(\sigma_{k-1}(n))$. Is it true that $\lim_{k \to \infty} \sigma_k(n)^{1/k} = \infty$ for all $n \geq 2$?

**Reference:** [erdosproblems.com/410](https://www.erdosproblems.com/410)

**Formal statement** (from [google-deepmind/formal-conjectures](https://github.com/google-deepmind/formal-conjectures)):
```lean
theorem erdos_410 : ∀ n > 1,
    Tendsto (fun k : ℕ ↦ ((sigma 1)^[k] n : ℝ) ^ (1 / (k : ℝ))) atTop atTop
```

### Project: erdos-410-v2 (Claude → Gemini) — [GitHub](https://github.com/jarredbarber/erdos-410-v2)

**Models:** Originally Claude, switched to Gemini 3 Pro High mid-project.  
**Status:** 1 sorry remaining (`ratio_divergence`). 2 citation axioms (Zsygmondy). 1152 lines Lean across 4 files, compiles. 77 tasks closed. Worker stopped, backlog empty.

**The open gap:** For any integer $n \geq 2$, define $a_0 = n$ and $a_{k+1} = \sigma(a_k)$. Prove that $\sigma(a_k)/a_k \to \infty$ as $k \to \infty$.

The proof skeleton reduces the main theorem to this single lemma. Everything else is proved. This is the mathematical core of the problem and is extremely hard — the problem has been open since Erdős proposed it, and the ratio divergence claim may require techniques comparable to results about prime growth in iterative sequences.

Five independent agent attempts at ratio divergence have been rejected by verify agents. The agents hit the same wall any human would.

#### Significant Result: Smooth Escape Lemma ⭐

**NL Status:** Verified ✅  
**Lean Status:** Proved ✅ (279 lines, modulo Zsygmondy citation axiom)  
**Generated by:** Claude

**Statement:** For any integer $n \geq 2$ and any finite set $S$ of primes, the $\sigma$-orbit is **not** eventually $S$-smooth.

```lean
theorem orbit_not_eventually_smooth (n : ℕ) (hn : 2 ≤ n) (S : Finset ℕ)
    (hS : ∀ p ∈ S, p.Prime) :
    ¬EventuallySmooth S n
```

**Dependency:** Zsygmondy's theorem (1892), well-established textbook result, stated as citation axiom.

#### Significant Result: Factor Pump ⭐

**NL Status:** Verified ✅  
**Lean Status:** Proved ✅ (259 lines, 0 sorrys, **no axioms**)  
**Generated by:** Gemini

**Statement:** $v_2(\sigma(n)) \geq \omega_{\text{odd}}(\text{oddPart}(n))$ — the 2-adic valuation of $\sigma(n)$ is at least the number of odd-exponent prime factors.

```lean
lemma v2_sigma_ge_omegaOdd_oddPart (n : ℕ) (hn : n ≠ 0) :
    padicValNat 2 (sigma 1 n) ≥ omegaOdd (oddPart n)
```

This creates a recursive amplification mechanism: more odd prime factors → higher power of 2 in next iterate → more factors in $2^{v+1} - 1$ → more odd prime factors. This is a novel result produced entirely by agents.

#### All Proved Results

| Result | NL | Lean | Axioms | Generator |
|--------|-----|------|--------|-----------|
| σ(m) ≥ m+1 for m ≥ 2 | ✅ | ✅ | 0 | Claude |
| σ(m) ≥ 3m/2 for even m ≥ 2 | ✅ | ✅ | 0 | Claude |
| σ-orbit tends to infinity | ✅ | ✅ | 0 | Claude |
| Smooth escape lemma | ✅ | ✅ | 1 (Zsygmondy) | Claude |
| Factor Pump (v₂ bound) | ✅ | ✅ | 0 | Gemini |
| Main theorem structure | ✅ | ✅ | 0 | Claude |
| σ(aₖ)/aₖ → ∞ | ❌ | ❌ | — | **open gap** |

### Project: erdos-410 (Claude, V1) — [GitHub](https://github.com/jarredbarber/erdos-410)

**Status:** 8 sorrys remaining, 0 axioms. 1544 lines Lean. 60+ tasks. One lemma discovered to be mathematically false. Kept running as a control experiment. Abandoned.

---

## Methodology

### Experimental Design

- **Zero human mathematical input.** All proofs, strategies, and Lean code are agent-generated. The human selected problems, set up project infrastructure, and occasionally intervened to redirect strategy (decomposing stuck tasks, closing dead-end approaches).
- **Strategic ignorance.** The human deliberately avoided learning the mathematics to maintain hermeticity. This is good for agents (they perform better not knowing difficulty) but bad for problem selection (729 turned out to have a known simple proof). See Observation 11.
- **No web search.** Agents have no access to arXiv, Mathlib docs, or any external resources during proof generation.

### Workflow

- **Roles:** "Explore" agents develop NL proofs, "verify" agents review them, "formalize" agents write Lean. An "advisor" decomposes problems into tasks. An "overseer" monitors progress via heartbeat.
- **Validation:** `lake build` with zero sorrys AND zero axioms is the only ground truth. Everything else is intermediate.

### Key Findings

- **Citation axioms are technical debt.** They let agents close tasks faster but defer verification. Human audit found 2/3 axioms in erdos-1094g were overstated (see [axiom-audit-1094.md](axiom-audit-1094.md)). Established results (Rosser-Schoenfeld, Dusart, Mertens, Zsygmondy) should stay as axioms — the project value is in the new combinatorial arguments.
- **Agents cannot audit agents on factual claims.** Verify agents reliably catch logical/mathematical errors but confidently approve hallucinated literature citations. Citation verification requires human ground-truth access.
- **Nat↔ℝ casting is the #1 formalization blocker.** Both 729-google and 1094g hit casting death spirals. Decomposing casting into small focused bridge lemmas helps.
- **Model comparison (Claude vs Gemini):** Same problem, same workflow, same seed → different strategies. Claude proves from first principles (slower, more thorough, no axioms). Gemini cites literature and builds architecture (faster, higher variance, prone to overconfident claims). Small sample size.
- **3-strike rule works.** After 63 failed build attempts on 729-google, decomposing the task into 4 subtasks was more productive than retrying.
- **All code is public.** GitHub repositories contain full task logs, NL proofs, dead-end records, and overseer memory.

### Related Documents

- [proof-comparison.md](../../erdos-729/proof-comparison.md) — Detailed comparison of Claude vs Gemini proof strategies for #729, and relationship to #728
- [axiom-audit-1094.md](axiom-audit-1094.md) — Human review of citation axioms in erdos-1094g
- [anthropology-erdos-410.md](anthropology-erdos-410.md) — Behavioral observations about agent proof-finding
- [lessons-learned-erdos-experiments.md](lessons-learned-erdos-experiments.md) — System design lessons
- [lessons-1094.md](lessons-1094.md) — Lessons specific to Problem 1094
