# Anthropology Notes: Erdős 728

## Experiment Setup

- **Start:** 2026-02-10 ~05:10 UTC
- **Problem:** Erdős 728 (existential, factorial divisibility with balanced a,b)
- **Workflow:** math-research v2 (first real test — librarian, planner/advisor split, ACH)
- **Models:** Gemini 3 Pro High + Claude Opus 4.6 Thinking (randomized per task)
- **Contamination check terms:** Sothanaphan, Aristotle, Harmonic, Barreto, 2601.07421, carry-rich, spike-free
- **Contamination status:** Clean as of 13:00 UTC (all terms negative)

## Observation Log

### Strategy Convergence with GPT-5.2 (13:00 UTC)

Agents independently converged on the same core construction as the GPT-5.2/Aristotle paper (arXiv:2601.07421): symmetric construction n=2m, a=m, b=m+k with Kummer's theorem for divisibility. Zero contamination detected. This suggests the construction is a natural attractor — multiple independent agents find it.

### C ≥ 1/2 Wall (13:00 UTC)

Agents proved the C < 1/2 case cleanly but hit a wall: m ≥ lcm(1..2k) ≈ e^{2k} forces k < (1/2)ln(m), so the symmetric construction can't reach C ≥ 1/2. GPT-5.2 found a way past this. Our agents haven't yet.

### Probabilistic Method Hypothesis (13:00 UTC)

**External prediction (mathematician):** Agents can sketch probabilistic proof strategies but cannot execute them rigorously.

**Evidence so far:**
- The skewed construction uses probabilistic/sieve reasoning: failure densities per prime, independence assumptions, expected value lower bounds
- The heuristic is plausible and correctly structured
- BUT: the "rigorous sieve argument" section is hand-wavy, hedges ("while the independence assumption is heuristic"), doesn't commit to a specific sieve theorem
- Agent knows it needs to make this rigorous but doesn't close the gap

**What to watch:**
- Does verify reject the probabilistic argument?
- Can a subsequent explore agent make it rigorous (LLL, second moment, specific sieve)?
- If agent writes "by a standard sieve argument" without specifying which one = capability gap signal

### Decomposition After Failure (05:30 UTC)

Monolithic explore task failed. Overseer decomposed into 3 parallel subtasks. All completed. Lesson from 729-google transferred via workflow design.

### Kummer Discovery — CONFOUNDED then REPLICATED (05:20 UTC / 14:40 UTC)

~~Agents discovered Kummer's theorem from problem structure alone.~~ **Confound discovered:** PROBLEM.md contained "The proof uses Kummer's theorem and carry counting in base-p arithmetic" from initial setup. Removed at 13:00 UTC but agents had already read it.

**Replication (728b):** Clean experiment launched at 14:37 UTC with NO technique hints. Agents rediscovered Kummer's theorem independently within the first explore cycle. **The Kummer discovery IS independent** — confirmed by clean replication. The 728a confound is moot.

### 728b Divergent Construction (15:00 UTC)

728b found a **different construction** from 728a and the GPT-5.2 paper. Instead of the symmetric n=2m approach, 728b uses M = m! - 1 (factorial minus one). Key insight: m!-1 has all digits equal to p-1 in every base p ≤ m, which eliminates carries for all small primes simultaneously. This avoids the lcm growth bottleneck that blocked 728a at C ≥ 1/2.

This is a genuinely novel approach — different from both 728a's symmetric construction and the GPT-5.2 paper's approach. If it works for all C, it would be a simpler proof. Still a draft — large prime handling via CRT perturbation needs verification.
