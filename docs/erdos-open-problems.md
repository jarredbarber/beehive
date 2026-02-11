# Open Erdős Problems — Formalized Statements

Source: [google-deepmind/formal-conjectures](https://github.com/google-deepmind/formal-conjectures)

361 Erdős problems have formalized Lean 4 statements. ~290 are tagged `research open`. This doc extracts the most approachable ones, sorted by estimated tractability for autonomous agent proof search.

**Approachability criteria:**
- Fewer custom definitions = less setup needed
- Simpler type signatures = easier for agents to work with
- Number theory / combinatorics = better Mathlib coverage
- Concrete/finite flavor = more amenable to computation-assisted proof
- Problems where partial results exist = stepping stones available

**Note:** "Approachable" here means "approachable for an LLM agent system," not "easy." These are all open problems.

---

## Tier 1: Most Approachable

Problems with simple statements, good Mathlib coverage, and concrete structure.

### Problem 398 — Brocard's Problem
> Does n! + 1 = m² have solutions other than n = 4, 5, 7?

```lean
theorem erdos_398 : answer(sorry) ↔ {n | ∃ m, n ! + 1 = m ^ 2} = {4, 5, 7}
```

**Why approachable:** Extremely concrete — it's a finiteness claim about a specific Diophantine equation. Computational verification is easy up to very large n. The hard part is proving no solutions exist beyond 7, but partial results and bounds exist in the literature. Lean has good factorial and Nat arithmetic support.

**Risk:** This is also known as Brocard's problem (1876). Despite its simple statement, it's been open for 150 years. Computational searches have verified no solutions up to 10^9.

### Problem 850 — Consecutive Numbers with Same Prime Factors
> Can there exist distinct x, y where x,y share prime factors, x+1,y+1 share prime factors, AND x+2,y+2 share prime factors?

```lean
theorem erdos_850 : answer(sorry) ↔ ∃ x y : ℕ, x ≠ y
    ∧ x.primeFactors = y.primeFactors
    ∧ (x + 1).primeFactors = (y + 1).primeFactors
    ∧ (x + 2).primeFactors = (y + 2).primeFactors
```

**Why approachable:** Very concrete. Either find an example (constructive) or prove none exists. Computational search is straightforward. The two-consecutive version (without +2) has known examples. The constraint is tight enough that a contradiction argument might work.

### Problem 412 — Convergence of σ-Orbits
> For every m, n ≥ 2, do there exist i, j such that σ_i(m) = σ_j(n)?

```lean
theorem erdos_412 : answer(sorry) ↔ ∀ᵉ (m ≥ 2) (n ≥ 2), ∃ i j, (σ 1)^[i] m = (σ 1)^[j] n
```

**Why approachable:** Directly related to our Erdős 410 work — same σ-orbit machinery. If 410's infrastructure (iterate growth, parity, prime accumulation) can be reused, this might be within reach. The question is whether all σ-orbits eventually merge.

**Synergy:** Our erdos-410 and erdos-410-v2 projects have substantial σ-orbit infrastructure already built.

### Problem 1094 — Prime Factors of Binomial Coefficients
> For n ≥ 2k, the least prime factor of C(n,k) is ≤ max(n/k, k), with finitely many exceptions.

```lean
theorem erdos_1094 :
    {(n, k) : ℕ × ℕ | 0 < k ∧ 2 * k ≤ n ∧ (n.choose k).minFac > max (n / k) k}.Finite
```

**Why approachable:** No `answer(sorry)` wrapper — it's a direct finiteness claim. Binomial coefficients have excellent Mathlib support. The bound max(n/k, k) is explicit. Could potentially be attacked by analyzing the prime factorization of C(n,k) via Kummer's theorem.

### Problem 396 — Divisibility of Central Binomial Coefficients
> For every k, does there exist n such that n(n-1)...(n-k) divides C(2n,n)?

```lean
theorem erdos_396 : answer(sorry) ↔ ∀ k : ℕ, ∃ n : ℕ, descFactorial n (k + 1) ∣ centralBinom n
```

**Why approachable:** Existential statement — for each k, find ONE n that works. Could potentially be solved by finding a pattern or explicit construction. Central binomial coefficients have good Mathlib support.

### Problem 28 — Additive Bases
> If A + A contains all but finitely many integers, then the representation function is unbounded.

```lean
theorem erdos_28 (A : Set ℕ) (h : (A + A)ᶜ.Finite) :
    limsup (fun (n : ℕ) => (sumRep A n : ℕ∞)) atTop = (⊤ : ℕ∞)
```

**Why approachable:** No `answer(sorry)` — direct statement. Additive combinatorics is well-developed. The hypothesis (A+A covers almost all of ℕ) is strong and should give density information about A. Classical proof techniques (generating functions, density arguments) are well-suited to agent reasoning.

---

## Tier 2: Moderate

Problems with clean statements but likely requiring deeper techniques.

### Problem 479 — Powers of 2 mod n
> For all k > 1, are there infinitely many n with 2^n ≡ k (mod n)?

```lean
theorem erdos_479 : answer(sorry) ↔ ∀ᵉ (k > 1), { n | 2 ^ n ≡ k [MOD n]}.Infinite
```

**Why moderate:** Clean number theory statement. The k=1 case (Wieferich primes) is famous and unsolved, but k > 1 might be more tractable. Modular arithmetic is well-supported in Mathlib.

### Problem 203 — Covering Systems with Powers of 2 and 3
> Is there an m coprime to 6 such that 2^k · 3^l · m + 1 is never prime?

```lean
theorem erdos_203 : answer(sorry) ↔ ∃ m, m.Coprime 6 ∧ ∀ k l, ¬ (2^k * 3^l * m + 1).Prime
```

**Why moderate:** Existential — find one m that works (or prove none exists). Related to covering congruences, which have good theory. Sierpiński numbers provide analogous constructions.

### Problem 371 — Largest Prime Factor Comparison
> The set of n where P(n+1) > P(n) has density 1/2.

```lean
theorem erdos_371 :
    { n | Nat.maxPrimeFac (n + 1) > Nat.maxPrimeFac n }.HasDensity (1/2)
```

**Why moderate:** Natural density statement. The symmetry argument (P(n+1) > P(n) vs P(n) > P(n+1) should be equally likely) gives the intuition. Making it rigorous requires sieve theory or analytic number theory.

### Problem 251 — Irrationality of Prime Series
> Is Σ p_n / 2^n irrational?

```lean
theorem erdos_251 : answer(sorry) ↔ Irrational (∑' n : ℕ, (Nat.nth Nat.Prime n) / (2 ^ n))
```

**Why moderate:** Clean statement. Irrationality proofs have well-known techniques (approximation by rationals, Liouville-type bounds). The prime number theorem gives growth estimates for p_n. But proving irrationality of specific sums is notoriously hard.

### Problem 249 — Irrationality of Euler Totient Series
> Is Σ φ(n) / 2^n irrational?

```lean
theorem erdos_249 : answer(sorry) ↔ Irrational (∑' n : ℕ, (φ n) / (2 ^ n))
```

**Why moderate:** Similar flavor to 251. The totient function has richer structure (multiplicativity) which might help or hinder.

### Problem 938 — AP-3 in Powerful Numbers
> Are there finitely many 3-term APs in consecutive powerful numbers?

```lean
theorem erdos_938 : answer(sorry) ↔ {P : Finset ℕ | Set.IsAPOfLength P.toSet 3 ∧ ∃ k,
    P = {nth Powerful k, nth Powerful (k + 1), nth Powerful (k + 2)}}.Finite
```

**Why moderate:** Combines powerful numbers (well-studied) with arithmetic progressions. The gap structure of powerful numbers is known asymptotically. Could potentially be attacked by analyzing when consecutive powerful numbers are equally spaced.

### Problem 826 — Slowly Growing Divisor Function
> Are there infinitely many n where τ(n+k) ≤ C·k for all k ≥ 1?

```lean
theorem erdos_826 : answer(sorry) ↔
    ∃ C > (0 : ℝ), { n | ∀ k ≥ 1, σ 0 (n + k) ≤ C * k }.Infinite
```

**Why moderate:** Asks for numbers where the divisor function grows linearly in a neighborhood. Probabilistic heuristics suggest such numbers exist (most numbers have "normal" divisor count). Making this rigorous requires understanding the distribution of τ.

---

## Tier 3: Hard but Interesting

### Problem 410 — Super-Exponential Growth of Iterated σ ⭐ (ACTIVE)
> σ_k(n)^{1/k} → ∞ for all n ≥ 2

```lean
theorem erdos_410 : answer(sorry) ↔ ∀ n > 1,
    Tendsto (fun k : ℕ ↦ ((sigma 1)^[k] n : ℝ) ^ (1 / (k : ℝ))) atTop atTop
```

**Status:** Two active autonomous proof attempts (erdos-410, erdos-410-v2). V2 has complete Lean skeleton with 1 sorry. Smooth escape lemma proved and externally validated by Gemini.

### Problem 855 — Goldbach-Type Inequality for π
> π(x + y) ≤ π(x) + π(y) for all sufficiently large x, y

**Why hard:** Essentially a strong form of the Goldbach conjecture. Requires deep understanding of prime distribution.

### Problem 1135 — Collatz Conjecture
> The Collatz conjecture.

**Why hard:** Self-explanatory. Included for completeness.

---

## Tier 4: Likely Intractable for Current Systems

Problems requiring substantial new mathematical ideas, deep algebraic geometry, or analytic number theory beyond current LLM capability:

- **Problem 1** — Sum-distinct sets (N ≫ 2^n), tight combinatorial optimization
- **Problem 3** — APs in sets with divergent reciprocal sums (Szemerédi-type)
- **Problem 39** — Infinite Sidon sets with near-optimal density
- **Problem 564** — Hypergraph Ramsey numbers (iterated logarithm bounds)
- **Problem 592** — Ordinal partition calculus

---

## Statistics

- **Total formalized:** 361
- **Open:** ~290
- **With variants/subproblems:** Many problems have easier variants tagged `undergraduate` or `graduate`
- **Number theory (AMS 11):** Dominant category
- **Combinatorics (AMS 5):** Second most common

## Notes on the `answer(sorry)` Pattern

Most problems use `answer(sorry) ↔ [statement]` where `answer` is a function that takes a proof of True or False. This means the formalization doesn't commit to whether the answer is yes or no — the solver must determine both the answer and prove it. Problems without this wrapper (like 28, 371, 1094) have a known expected answer built into the statement.
