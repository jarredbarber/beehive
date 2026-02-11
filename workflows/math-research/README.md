# Math Research Workflow

## Overview

A bidirectional proof search workflow that separates mathematical reasoning from formal verification. Designed for hard problems where the math and the Lean formalization are different bottlenecks.

## Agents

| Agent | Role | Direction | Medium |
|-------|------|-----------|--------|
| **explore** | Creative proof discovery | Forward | `proofs/*.md` (natural language) |
| **formalize** | Close sorry holes in Lean | Backward | `*.lean` source files |
| **verify** | Peer review NL proofs | — | Reviews `proofs/*.md` |
| **advisor** | Strategy, gap analysis, task creation | Both | Reads everything |

### How It Works

**Forward (explore):** Proves results in natural language → peer reviewed → published to the literature directory.

**Backward (formalize):** Closes `sorry` holes in Lean → guided by verified NL proofs → every commit must compile.

**The join (advisor):** Reads sorry types + literature, spots where a verified NL proof can close a sorry, creates bridging tasks.

## Project Structure

```
<LeanProject>/
  *.lean              # Theorem statements (IMMUTABLE) + proofs with sorry holes
proofs/
  README.md           # Index of all results with status
  *.md                # Natural language proofs (Draft/Verified/Rejected)
problem.md            # Problem description (advisor-only context)
CLAUDE.md             # Project-level instructions
```

## The Literature Directory

`proofs/` decouples forward exploration from backward formalization:

| Status | Meaning | Who sets it |
|--------|---------|-------------|
| Draft ✏️ | Unreviewed proof | explore |
| Under review 🔍 | Needs revision | verify |
| Verified ✅ | Correct, ready for formalization | verify |
| Rejected ❌ | Flawed (kept to prevent re-exploration) | verify |

## Key Design Principles

1. **Separate math from Lean** — different skills, different models, different costs
2. **Never tell workers a problem is hard** — surrender is contagious
3. **Compile checkpoints** — every commit must `lake build`, sorries are OK, errors are not
4. **Branch per task** — preserve failed work, keep main clean
5. **Compiler defines the DAG** — sorry types are better task specs than upfront planning
6. **Verify NL before formalizing** — catch bad math before expensive Lean cycles
7. **Iterate with feedback** — enriched context after failure, not fail-and-rollback
8. **Information asymmetry** — advisor knows difficulty, workers don't
