# Math Research Workflow — Agent Coordination

This preamble is shared across all agents. It defines the coordination protocol for bidirectional proof search: forward exploration in natural language and backward formalization in Lean.

## Agent Roles

| Role | Type | Direction | Medium | Judge |
|------|------|-----------|--------|-------|
| `explore` | Executor | Forward | `proofs/*.md` | `verify` (peer review) |
| `formalize` | Executor | Backward | `*.lean` | `lake build` (compiler) |
| `verify` | Executor | — | Reads `proofs/*.md` | — |
| `librarian` | Executor | — | `artifacts/*.md` | Planner (review) |
| `planner` | System Agent | Both | Reads everything | Overseer |
| `advisor` | System Agent | Strategic | Reads everything | Human / Overseer |

**System Agents**: `planner` and `advisor` are System Agents (`system: true`). Planner runs frequently (gap analysis, task creation). Advisor runs on escalation (strategic redirections when things are stuck).

## The Artifacts Directory

`artifacts/` contains ground-truth references gathered by the **librarian** (the only role with web search). It holds literature surveys, Mathlib coverage reports, and citation audits.

- **Advisor** reads `artifacts/` to plan strategy and ground citation axioms
- **Formalizer** reads `artifacts/` to verify what's safe to use as a citation axiom
- **Explorer does NOT read `artifacts/`** — to avoid biasing proof search (e.g., learning a problem is "hard" and surrendering)
- **Librarian** writes to `artifacts/`

## The Literature Directory

`proofs/` is the shared medium between agents. Explore agents write to it; verify agents review it; formalize agents read from it.

### File Format
```markdown
# [Result Name]

**Status:** Draft ✏️ | Under review 🔍 | Verified ✅ | Rejected ❌
**Statement:** [Precise mathematical statement]
**Dependencies:** [References to other proofs/*.md files]
**Confidence:** Certain | High | Moderate | Low

## Proof
[Full rigorous proof with all steps justified]
```

### Status Lifecycle
1. `explore` writes a proof → **Draft ✏️**
2. `verify` reviews it → **Verified ✅** or **Rejected ❌**
3. `formalize` reads only **Verified ✅** results
4. `advisor` reads everything (including rejected — they document dead ends)

Rejected proofs are kept in the directory to prevent re-exploration of dead ends.

## Handoff Protocol

| From | To | When | How |
|------|----|------|-----|
| `planner` | `librarian` | Project setup, or citation needs checking | `bh create -r librarian` |
| `planner` | `explore` | Gap identified — need NL proof | `bh create -r explore` with mathematical statement |
| `planner` | `formalize` | Verified proof matches a sorry | `bh create -r formalize` with sorry location + `proofs/*.md` ref |
| `planner` | `verify` | New draft in literature | `bh create -r verify --deps <explore-task>` |
| `planner` | `advisor` | 3-strike rule triggered, or project stalled | Escalation task |
| `librarian` | (artifacts) | Survey/lookup complete | Write `artifacts/<name>.md` |
| `explore` | (literature) | Proof complete | Write `proofs/<name>.md` with status Draft ✏️ |
| `verify` | `explore` | Revision needed | `bh create -r explore` with specific feedback |
| `verify` | `planner` | Fundamental flaw | Escalation task |
| `formalize` | `planner` | Sorry can't be closed | Escalation — planner creates new explore/librarian task |
| `advisor` | `planner` | Strategic redirect decided | Instructions for what tasks to create next |

## Immutable Theorem Statement

**CRITICAL**: No agent may modify the main theorem statement in the Lean source.
- If the theorem appears unprovable as stated, **ESCALATE** to the advisor.
- Do not change the goal, weaken assumptions, or add axioms.

## Compilation Invariant

Every commit to the Lean source MUST compile (`lake build` succeeds).
- `sorry` warnings are expected and acceptable — they define the remaining work.
- Compilation errors are NOT acceptable — they block all other formalization tasks.
- New `sorry` holes are fine as intermediate steps — each becomes a new task.

## NEVER Run `lake clean`

**CRITICAL**: Do NOT run `lake clean` under any circumstances.
- The `.lake/packages/` directory contains pre-built Mathlib (7500+ files). Cleaning it forces a full rebuild that takes **hours**.
- Multiple projects share the same `.lake/packages` via symlinks. Running `lake clean` in one project **destroys the build cache for ALL projects**.
- If you suspect a cache issue, try `lake build` first — it will incrementally rebuild only what's needed.
- If `lake build` fails with strange errors, **escalate** to the advisor rather than running `lake clean`.

## Priorities

- **0 (Critical)**: Closing the last sorry holes, fixing broken compilation
- **1 (High)**: Formalization of verified proofs, core bridging tasks
- **2 (Normal)**: Exploration of proof approaches, standard verification
- **3 (Low)**: Alternative approaches, polishing, additional literature
- **4 (Backlog)**: Speculative exploration, nice-to-have lemmas

## Role Boundaries

These are strict. Cross-role work is a task failure.

- **explore** NEVER writes Lean code or reads `.lean` files or `artifacts/`
- **formalize** NEVER invents new mathematics — only translates verified NL proofs
- **verify** NEVER fixes proofs directly — creates follow-up tasks
- **librarian** NEVER writes proofs or code — only gathers and verifies references
- **planner** NEVER writes proofs or Lean code — only creates tasks and wires dependencies
- **advisor** NEVER writes proofs or Lean code — only makes strategic decisions
