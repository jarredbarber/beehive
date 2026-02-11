# Axiom Audit: Erdős 1094

**Purpose:** Track whether citation axioms in erdos-1094g match the actual published results.  
**Status:** IN PROGRESS — human checking source papers

## Summary

The erdos-1094g proof uses 3 citation axioms. At least one has been confirmed to overstate the source paper. If the formalize tasks (fb3, mzm, r7a) succeed in replacing these with Lean proofs, the axiom accuracy becomes moot — the compiler is the final arbiter.

## Axiom 1: `sylvester_theorem`

```lean
axiom sylvester_theorem (n k : ℕ) (h : 2 * k ≤ n) :
    ∃ p, p.Prime ∧ p ∣ (n.choose k) ∧ p > k
```

**Cited source:** Sylvester (1892)  
**Audit status:** ⚠️ Not yet checked against original paper. The verify agent (erdos1094g-031) found the original hypothesis was `k < n` (unsound for k < n < 2k) and tightened it to `2 * k ≤ n`.

## Axiom 2: `ecklund_1969_case1_bound`

```lean
axiom ecklund_1969_case1_bound (n k : ℕ) (h_k : 0 < k) (h_nk : 2 * k ≤ n) (h_n_k2 : k * k ≤ n)
    (h_not_exc : (n, k) ≠ (62, 6)) : g n k ≤ n / k
```

**Cited source:** Ecklund, E.F. Jr., "On the prime factorization of binomial coefficients", *Pacific J. Math.* 29(2), 267-270 (1969)  
**Audit status:** ❌ **OVERSTATED.** The actual 1969 theorem states:

> If n ≥ 2k, then C(n,k) has a prime divisor p ≤ max(n/k, **n/2**) with the exception (7 choose 3).

The paper proves p ≤ max(n/k, n/2), NOT p ≤ n/k for n ≥ k². The axiom claims a much stronger bound. The agent hallucinated the stronger result.

## Axiom 3: `ees_1974_case2_bound`

```lean
axiom ees_1974_case2_bound (n k : ℕ) (h_nk : 2 * k ≤ n) (h_n_k2 : n < k * k)
    (h_not_exc : (n, k) ∉ ExceptionsCase2) : g n k ≤ k
```

**Cited source:** Ecklund, Eggleton, Selfridge (1974)  
**Audit status:** ❌ **WRONG PAPER.** The 1974 EES paper studies g(k) = the least integer > k+1 such that ALL prime factors of C(g(k), k) are > k. This is the opposite direction — it's about when NO small prime factor exists, which is Erdős problem [1095], not [1094]. The agent cited a paper about a different problem. The claim in the axiom (for ALL 2k ≤ n < k², g(n,k) ≤ k with 13 exceptions) does not appear in this paper.

## Key Observation

The problem was **conjectured** by Erdős, Lacampagne, and Selfridge in 1988 (*Acta Arithmetica*, 507-523) and is listed as open on erdosproblems.com. If it were already proved by 1974, it wouldn't be conjectured in 1988. The agents' axioms almost certainly overstate the literature.

**This does not affect soundness IF the formalize tasks succeed.** A Lean proof with zero axioms and zero sorrys needs no literature backing.

## References

- Ecklund (1969): *Pacific J. Math.* 29(2), 267-270 — proves p ≤ max(n/k, n/2)
- Ecklund, Eggleton, Selfridge (1974): full citation TBD
- Erdős, Lacampagne, Selfridge (1988): *Acta Arith.*, 507-523 — **conjectures** the result
- Erdős, Lacampagne, Selfridge (1993): *Math. Comp.*, 215-224 — computational evidence
- Moree (1995): corrections to exception list
