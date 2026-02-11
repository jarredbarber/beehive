# Math Research Workflow — Overseer Context

## Workflow Roles
- **Planning agent**: `planner` — gap analysis, task creation, dependency wiring
- **Strategic agent**: `advisor` — approach pivots, 3-strike redesigns, axiom audits
- When backlog is empty: `bh create -t "Gap analysis: backlog empty" -r planner -p 0`
- When 3 failures on same sorry: `bh create -t "Strategic review: repeated failures" -r advisor -p 0`

## Health Metrics
- **Sorry count**: `grep -rn sorry *.lean **/*.lean 2>/dev/null | grep -v '.lake/' | wc -l`
- **Axiom count**: `grep -rn '^axiom' *.lean **/*.lean 2>/dev/null | grep -v '.lake/' | wc -l`
- **Literature**: `ls proofs/*.md 2>/dev/null | wc -l` verified NL proofs
- **Compilation**: Check recent formalize task logs for `lake build` results. Do NOT run `lake build` yourself.
- **Task throughput**: Tasks closed since last heartbeat

## Progress Signals
- Sorry count decreasing
- New verified proofs in `proofs/`
- Formalize tasks closing
- Git commits modifying `.lean` files

## Workflow-Specific Checks
- **New axioms without librarian verification**: If `grep -rn '^axiom' Erdos/*.lean` shows axioms not mentioned in any librarian task, create: `bh create -t "Verify axiom: [name]" -r librarian -p 1`
- **Crux axiom detection**: If an axiom's type signature closely matches the main theorem, that's a crux axiom (debt, not progress). Flag in memory and create an advisor task.
- **Forward-backward disconnect**: Many NL proofs but sorry count flat → create planner task for gap analysis

## Failure Patterns
- **Surrender**: Agent closes task as "blocked on open conjecture." Delete defeatist docs. Reopen with neutral framing.
- **Monolith**: 300+ line proof that won't compile. Close, create planner task to decompose.
- **Hallucination**: Repeated `unknown identifier`. Add correct lemma names to retry description.
- **Stagnant sorrys**: Unchanged across 3+ heartbeats → create planner task.

## Framing Rules
Never use in task descriptions: "hard," "open," "unsolved," "conjecture," "unknown"
