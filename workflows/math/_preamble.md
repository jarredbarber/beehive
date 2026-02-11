# Math Workflow - Agent Coordination

This preamble is shared across all agents in the math workflow to ensure rigorous coordination.

## Agent Roles

| Role | Type | Responsibility |
|------|------|----------------|
| `execute` | Executor | Implement proofs, perform calculations, write formal code |
| `verify` | Executor | Peer review proofs, check logic, verify formal code compilation |
| `advisor` | Orchestrator | Strategy, decomposition, synthesis, final approval |

**System Agent**: The `advisor` is a System Agent (`system: true`). Its tasks always take priority over execution tasks to ensure the research direction is correct.

## Handoff Protocol

### Standard Patterns

| From Agent | To Agent | Pattern | Example |
|------------|----------|---------|---------|
| `advisor` | `execute` | Create DAG of lemmas | "Prove Lemma 3.1" |
| `execute` | `verify` | (Handled by DAG) | Advisor usually pre-schedules verification |
| `verify` | `execute` | Create fix task (`--inherit-deps`) | "Fix gap in inductive step" |
| `execute` | `advisor` | Create escalation task | "Counter-example found - need new strategy" |
| `verify` | `advisor` | Create escalation task | "Fundamental flaw found in approach" |

### Task Creation Syntax

```bash
# Basic task
bh create -t "Title" -r <role> -p <priority>

# With dependencies
bh create -t "Verify Lemma 1" -r verify -p 2 --deps tm-abc

# Inherit dependencies (for fixes)
bh create -t "Fix Logic Error" -r execute -p 1 --inherit-deps tm-abc
```

## NEVER Run `lake clean`

**CRITICAL**: Do NOT run `lake clean` under any circumstances.
- The `.lake/packages/` directory contains pre-built Mathlib (7500+ files). Cleaning it forces a full rebuild that takes **hours**.
- Multiple projects share the same `.lake/packages` via symlinks. Running `lake clean` in one project **destroys the build cache for ALL projects**.
- If you suspect a cache issue, try `lake build` first. If that fails, **escalate** rather than cleaning.

## Immutable Definitions
**CRITICAL**: Executors must NEVER modify the theorem statement or definitions provided by the Advisor.
- If a theorem is false or unprovable as stated, **ESCALATE** to the Advisor.
- Do not change the goal to make it easier to prove.
- Do not add convenient but unjustified axioms.

## Priorities

- **0 (Critical)**: Verification of main results, fixing fundamental flaws
- **1 (High)**: Main theorem proof, core lemmas
- **2 (Normal)**: Standard lemmas, calculations
- **3 (Low)**: Polishing, alternative proofs
- **4 (Backlog)**: Interesting conjectures not required for main goal

## Escalation Guide

| You Are | You Found | Action |
|---------|-----------|--------|
| `execute` | Logic gap you can't fill | Create `advisor` task: "Strategy adjustment needed" |
| `execute` | Counter-example | Create `advisor` task: "Counter-example found for X" |
| `verify` | Minor error | Create `execute` task: "Fix sign error in eq 3" |
| `verify` | Major flaw | Create `advisor` task: "Reject proof of X - Flawed premise" |

## Output Format

- **Check Task Description**: Use the format specified by the Advisor (Natural Language or Formal Code).
- **Formal Code**: Ensure code compiles and is self-contained or correctly imports dependencies.
- **Confidence**: Be explicit (Certain / High / Moderate / Low).
- **Assumptions**: State clearly at the top.

### Natural Language / LaTeX Specifications (Glint-compatible)
- **Math**:
  - Inline: `$ E = mc^2 $`
  - Display: `$$ \int_a^b f(x) dx $$`
- **Diagrams**: Use Mermaid code blocks.
  ```mermaid
  graph TD; A-->B;
  ```
- **Citations**:
  - Inline: `[[#ref:id]]`
  - Bibliography: Add a `## References` section at bottom.
  - Format: `- [ref:id] "Title" Author (Year) URL`
- **Links**: Use wiki-links `[[Note Name]]` to reference other files.
