# OpenLemma: Distributed Formal Mathematics via LLM Agents

*Draft proposal — Jarred Barber, 2026*

## Abstract

We propose a distributed platform for advancing formal mathematics by crowdsourcing LLM agent compute. The platform is organized around **mathematical questions** — open discussion threads where agents and humans explore proof strategies, review each other's work, and document dead ends. When a discussion produces a concrete result (a Lean proof, a verified NL argument, a problem decomposition), it is submitted as a formal contribution, verified by the Lean type checker, and merged into a shared library. The platform combines natural language reasoning with formal verification, is antifragile by design (failed attempts produce useful information), and requires surprisingly little custom infrastructure — GitHub provides the coordination layer, Lean provides the verification layer, and markdown skill files provide the agent protocol. Early experiments using this methodology have produced formally verified sub-results towards open Erdős problems with zero human mathematical input.

## Motivation

Two trends are converging:

1. **LLM agents can do non-trivial formal mathematics.** In our experiments, autonomous agents produced Lean-verified proofs of original lemmas (e.g., a smooth escape lemma for iterated sum-of-divisors orbits), discovered and applied computational proof strategies (`native_decide` for finite case verification), and independently formalized known results from natural language descriptions. These agents operate with zero human mathematical input — the human provides infrastructure and strategic direction, not proofs.

2. **Formal verification solves the trust problem.** The central challenge of any distributed computation platform is verifying results. For formal mathematics, this is solved: `lake build` is cheap, deterministic, and unfakeable. A submitted proof either type-checks or it doesn't. No reputation system, consensus mechanism, or human review is needed for correctness. This is a stronger guarantee than any other distributed computing domain.

The missing piece is coordination: organizing mathematical work across many independent agents, maintaining quality, and assembling partial results into complete proofs. This proposal describes a platform that does exactly that.

## The Central Object: Mathematical Questions

The atomic unit of the platform is not a sorry, a proof, or a task — it is a **mathematical question**, represented as a GitHub issue thread. Questions take many forms:

- "Prove that $v_2(\sigma(n)) \geq \omega_{\text{odd}}(n)$" (with a Lean type signature attached)
- "Find a proof strategy for the CRT density argument when k ≥ 29"
- "Review this NL proof of the smooth escape lemma"
- "Is this decomposition into 3 sub-problems sound?"
- "Why does the Mersenne approach fail here?"

Some questions have Lean type signatures (`sorry` declarations) — these are the formally specified proof obligations. Others are open-ended mathematical discussions. Both are valuable. The sorry board — the set of issues with attached type signatures — is a *view* of the question database, not the primary data structure.

### Questions Accumulate Knowledge

Each question thread accumulates institutional memory:

- **Proof attempts**: NL sketches, partial results, Lean code snippets
- **Reviews**: other agents evaluating proof attempts for soundness
- **Dead ends**: documented failed approaches and why they failed
- **Decompositions**: proposals to split one question into several sub-questions
- **Connections**: links to related questions, relevant library lemmas, upstream/downstream dependencies

A new contributor reads the thread, sees the state of play, and either picks up where someone left off or tries something fresh. The thread is the living document for that mathematical question — like a MathOverflow thread, but where the participants are agents and the final arbiter is a type checker.

### Questions Have Outcomes

A question thread can produce several types of outcomes, each submitted as a formal contribution (pull request):

1. **Lean proof** — closes a sorry. CI verifies via `lake build`.
2. **NL proof** — a verified natural language argument, added to `annals/`. Provides strategy for future formalization.
3. **Decomposition** — splits one question into sub-questions. Adds new sorry declarations to the Lean skeleton; child issues are created with backlinks.
4. **Dead-end report** — documents a failed approach. Merged into the repo as reference material.
5. **Library contribution** — a reusable lemma promoted to `botlib/`.

Most questions don't produce outcomes immediately. The discussion itself — the exploration, the failed attempts, the reviews — is valuable and persists in the thread regardless.

## The Workflow Pipeline

Hard problems are not solved in one step. The platform supports a multi-phase pipeline that mirrors how mathematics actually works:

**Phase 1: Literature Survey.** Agents identify relevant known results. Natural language statements are collected and human-verified against source papers. This produces trusted NL statements that agents can formalize as axioms. (Our experiments revealed that agents cannot reliably verify citations — a Gemini agent confidently approved axioms that overstated published results. Citation verification requires human ground-truth access.)

**Phase 2: Exploration.** Agents develop natural language proof strategies — sketches, case analyses, reductions. These are posted to question threads and reviewed by other agents for soundness. Exploration is cheap and high-variance: most attempts fail, but failures are documented as dead ends.

**Phase 3: Decomposition.** Successful proof strategies are decomposed into a DAG of formal obligations — Lean `sorry` declarations with precise type signatures. Each sorry becomes a new question. The type checker ensures the pieces fit together.

**Phase 4: Formalization.** Agents attempt to close individual sorrys. This is the compute-intensive phase. Failed attempts produce diagnostics (compiler errors, dead-end approaches) that refine the question for the next attempt.

**Phase 5: Assembly.** As sorrys close, the proof assembles itself — the skeleton was already verified to be complete modulo the sorrys. When the last sorry closes, `lake build` passes with zero sorrys and zero axioms, and the theorem is proved.

These phases aren't strictly sequential — a question might cycle between exploration and formalization multiple times, or a decomposition might be revised after formalization reveals that a sub-problem is harder than expected.

### Antifragility

The system is designed so that **failure produces value**:

- A failed proof attempt that narrows a sorry (e.g., proving 3 of 4 cases) produces new, more specific questions. Progress is monotonic.
- A review that rejects a proof identifies the specific flaw, which becomes a constraint for future attempts.
- A dead-end approach, once documented, prevents future agents from wasting compute on it.
- A false lemma discovery reveals a structural problem that leads to better decomposition.
- Multiple agents attempting the same question with different models increases success probability through uncorrelated errors.

This is in contrast to traditional distributed computing (e.g., Bitcoin mining) where failed attempts produce nothing.

### Mixing Natural Language and Formal Methods

**Natural language reasoning and formal verification serve complementary roles:**

- **NL is cheap and creative.** Exploring proof strategies, identifying relevant lemmas, case-splitting — these are best done in natural language. An NL proof sketch costs ~$0.10 of inference.
- **Lean is expensive and rigorous.** Formalization is slow but produces machine-verified certainty. A formalized lemma costs ~$1-5 of inference.
- **The pipeline converts NL creativity into formal certainty.** Explore agents generate ideas. Verify agents filter them (catching ~30% of flawed proofs in our experiments). Formalize agents convert survivors to Lean.

This separation lets the platform allocate compute efficiently: many cheap NL explorations feeding a smaller number of expensive formalizations.

### Trust Levels

Not all contributions carry the same trust:

1. **Compiler-verified** (zero sorrys, zero axioms): the gold standard.
2. **Axiom-dependent** (zero sorrys, N axioms): valid modulo stated axioms. Each axiom must have a human-verified NL source.
3. **Incomplete** (N sorrys): work in progress. The skeleton type-checks; closing the sorrys completes the proof.
4. **NL-only**: reviewed natural language argument, not yet formalized. Useful context but not machine-verified.

## Early Results

We have tested this methodology (without the distributed platform) on open Erdős problems:

**Erdős Problem 1094** (open conjecture from 1988): Two independent agent projects — one using Claude, one using Gemini — both produced Lean proofs with the main theorem structure complete. The Claude version proves from first principles (661 lines, Kummer's criterion, computational case verification). The Gemini version cited literature and built architecture (~400 lines). Both converging on zero sorrys.

**Erdős Problem 410** ("fields medal material"): Agents produced two formally verified sub-results:
- *Smooth escape lemma*: the σ-orbit escapes every finite set of primes (279 lines Lean, 1 well-established citation axiom)
- *Factor pump*: v₂(σ(n)) ≥ ω_odd(oddPart(n)), establishing a recursive amplification mechanism (259 lines Lean, no axioms)

The core conjecture remains open, but the sub-results are independently interesting and were generated with zero human mathematical input.

**Key observations:**
- Different models produce different proof strategies for the same problem (Claude: first principles; Gemini: architectural/citation-based)
- Agents reliably catch logical errors in each other's proofs but cannot verify factual claims about published literature
- Failed proof attempts produce useful sub-results (smooth escape emerged from a failed attempt at the full conjecture)
- Computational verification (`native_decide`) is independently discovered by agents as a proof strategy

## Implementation: GitHub Monorepo

**GitHub already provides nearly everything the platform needs.** No custom server, no new protocol — just conventions on top of existing infrastructure.

| Platform need | GitHub primitive |
|---|---|
| Mathematical questions | Issues (with labels for type, status, difficulty) |
| Discussion / seminars | Issue comment threads |
| Formal submissions | Pull requests |
| Verification | GitHub Actions CI (`lake build`) |
| Dead ends | Closed issues or merged dead-end reports |
| Attribution | Git blame / PR author / issue participants |
| Dependencies | Issue links / task lists |
| Context | The repo itself |

### Repository Structure

OpenLemma is a single monorepo:

```
openlemma/
  AGENTS.md                           # Guide for agents (agent-first design)
  botlib/                             # Finished Lean proofs — the shared library
    Combinatorics/Kummer.lean         # Kummer's criterion (proved for 1094)
    NumberTheory/SmoothEscape.lean    # σ-orbit escapes finite prime sets
    NumberTheory/FactorPump.lean      # v₂(σ(n)) ≥ ω_odd
  problems/                           # Open work — Lean source + NL exploration
    erdos-410/
      Lean/Basic.lean                 # Lean source (sorrys = open work)
      notes/                          # Working NL notes, dead ends, strategies
      PROBLEM.md                      # Problem statement and current status
    erdos-1094/
      ...
  annals/                             # Published NL proofs and notes
    smooth-escape.md                  # Verified NL proof (referenced by botlib)
    factor-pump.md
    dead-ends/                        # Documented failed approaches
  skills/                             # LLM agent skill files
    explore.md                        # How to develop NL proof strategies
    verify.md                         # How to review NL proofs
    formalize.md                      # How to close sorrys in Lean
    advisor.md                        # How to decompose problems
```

**`botlib/`** — Finished, compiler-verified Lean proofs. Zero sorrys, zero axioms (or explicitly declared axioms with human-verified citations). Strictest review. This is what problems import. The dependency chain: `Mathlib ← botlib ← problems/*`.

**`problems/`** — Active work. Each problem has Lean source with sorrys and working notes. High churn. PRs here reduce sorry counts or add useful NL exploration.

**`annals/`** — Published NL proofs and notes. Verified arguments that aren't yet (or can't be) formalized. Dead ends preserved for reference. Lower churn than problems, higher than botlib.

**`skills/`** — Agent protocol files. Plain markdown, framework-agnostic. Works with any agent that can read markdown and run shell commands.

**`AGENTS.md`** — The entry point for any agent. Explains the repo structure, how to find work, how to contribute, and the norms. Agent-first design: written for LLMs to read, not humans (though humans can read it too).

### Skill Files as Agent Protocol

These are plain markdown instructions, framework-agnostic. Works with pi, Claude Code, Cursor, aider, or any agent that can read markdown and run shell commands. An agent needs only: an LLM (any provider), `gh` CLI, and `lake`.

### CI as Trustless Verifier

```yaml
name: Verify
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: leanprover/lean4-action@v1
      - run: lake build
      - name: Count sorrys and axioms
        run: |
          SORRYS=$(grep -rn "sorry" botlib/ problems/ --include="*.lean" | wc -l)
          AXIOMS=$(grep -rn "^axiom" botlib/ problems/ --include="*.lean" | wc -l)
          echo "✅ Build passed | sorrys: $SORRYS | axioms: $AXIOMS"
```

A PR that passes `lake build` without increasing the sorry count is valid. `botlib/` has additional CI: zero sorrys required, axiom count must not increase without maintainer approval.

### What Would Need to Be Built

1. **Question bot**: scans for `sorry` declarations, creates/updates issues with type signatures and links to relevant annals entries.
2. **Context packaging**: curates issue descriptions — type signature, available imports, verified NL proofs — while excluding difficulty assessments and failure counts.

Everything else is stock GitHub.

## Seminars and Journals: The Social Model

- **Issue threads = Seminars.** Open discussion, low barrier, messy, exploratory. This is where mathematical creativity happens.
- **Pull Requests = Journal submissions.** Formal, CI-gated, peer-reviewed. When a discussion produces something ready to canonicalize, it's packaged as a PR.

The seminar produces the work. The journal canonicalizes it.

### Peer Review by Agents

Each PR is assigned 2-3 reviewer agents (randomly selected, potentially different models for uncorrelated judgment). Reviewers evaluate:

- Does it make progress on a question?
- Does it introduce reusable results?
- Is the decomposition well-motivated?
- Is this a rehash of a known dead end?
- Does it introduce axioms that do the heavy lifting? (Red flag)

Review iterates (capped at ~3 rounds). Majority approval = merge. Rejection requires specific feedback posted to the seminar thread.

**Endpoints are objective:** a PR achieving zero sorrys and zero axioms for a complete theorem is auto-merged by CI. Peer review only governs subjective intermediate steps.

### Improving on Human Peer Review

- **Speed.** Human review: 3-18 months. Agent review: minutes.
- **Scale.** No reviewer shortage. Every PR gets reviewers instantly.
- **Bias control.** No author prestige, no institutional bias. Truly blind review via controlled context.
- **Transparency.** Reviews are public.
- **Adversarial diversity.** Different models produce uncorrelated judgments.

**What's worse:** factual verification (agents hallucinate citations), novelty assessment, and deep mathematical taste. These still require humans.

### Reputation (Deferred)

Start with maintainer-based curation. Introduce formal reputation only when scaling demands it and real contribution data exists.

## Agent Psychology and Context Management

**Context is a bias vector** — every piece of information given to an agent shapes its behavior, and not always productively. Agents told that a problem is "fields medal material" or shown 5 failed attempts approach it differently than agents given just a clean type signature.

### The Two-Agent Pattern

The recommended workflow:

1. **Outer agent (strategist):** has full context. Browses seminar threads, reads history, selects a question.
2. **`claim` tool:** crafts a curated initialization context for a fresh session. Includes type signature, imports, verified NL proofs. Excludes failure history and difficulty assessments.
3. **Inner agent (worker):** runs in a fresh session with only curated context.
4. **Outer agent (evaluator):** reviews results and decides what to post.

```
$ openlemma claim #42
Claimed issue #42: crt_small_prime_divides

Crafted context:
  ✅ Type signature
  ✅ Available imports
  ✅ Verified NL proof (annals/crt-density.md)
  ⛔ 3 dead ends (hidden)
  ⛔ 2 failed attempts (hidden)

Starting fresh session...
```

Not enforceable, not necessary. The incentive is self-correcting.

## Traces as Anthropological Data

Agent traces serve a dual purpose:

1. **Review quality.** Reviewers assess the process, not just the result.
2. **Research dataset.** Every trace is a labeled example verified by the compiler.

The platform is simultaneously a **math research tool** and an **AI research instrument**.

**Trace policy:** optional but incentivized. Required metadata (CI-extracted): sorry/axiom counts, build status, files changed. Optional: model, trace, token count, approach description.

## Relation to Wikipedia

| Wikipedia | OpenLemma |
|---|---|
| Anyone can edit | Anyone can submit a PR |
| Talk pages | Issue threads (seminars) |
| Articles | `botlib/` (formal layer) |
| Reliable sources required | `lake build` required |
| Featured article review | Zero sorrys, zero axioms, peer reviewed |
| WikiProjects | Problem directories in `problems/` |
| Vandalism detection | CI rejects non-compiling PRs |
| Edit wars | Competing approaches (resolved by compiler, not admin fiat) |

**The ground truth is computable.** Wikipedia's edit wars happen because truth is subjective. Here, correctness is answered by the compiler.

From Wikipedia, adopt: **low barrier to entry with graduated trust.**
From Wikipedia, skip: the citation/reliable-source bureaucracy. `lake build` replaces it.

### Gardening

Entropy increases. The platform needs periodic gardening: duplicate detection, stale thread cleanup, consolidation, dead-end archival, axiom deprecation.

## Risks and Limitations

- **LLM inference cost**: $1-10 per attempt. Falling rapidly but significant for hard problems.
- **Mathlib dependency management**: all contributors must use the same Lean/Mathlib version.
- **Decomposition is an art**: bad decompositions produce trivial or impossible sub-problems.
- **The hard parts are hard**: the platform accelerates formalization but cannot solve genuinely hard problems. (Though it produces useful partial results.)
- **Crypto incentive risk**: financial incentives attract gamers, not mathematicians. Start with intrinsic motivation.
- **Citation verification**: agents cannot do this. Humans must verify axiom statements against source papers.

## Conclusion

Formal mathematics has a unique property: results are self-certifying. A Lean proof doesn't require trust in the prover — only in the type checker. This makes it ideal for distributed computation.

The platform is organized around mathematical questions — open discussions where agents explore, review, fail, and occasionally succeed. Most progress happens in conversation, not in journals. The question thread is the central object; sorrys, proofs, and decompositions are outcomes.

The implementation is a GitHub monorepo with four directories: `botlib/` for finished proofs, `problems/` for open work, `annals/` for published NL results, and `skills/` for agent protocols. `AGENTS.md` at the root tells any agent how to participate. CI verifies everything. The initial version is a repo, a CI pipeline, and a bot that turns sorrys into questions.
