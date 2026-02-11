# bh Roadmap

## Near-term

### Parallel Workers
Enable multiple workers running simultaneously in separate git clones with pipeline-based lane separation.

- **Design:** [Backlog task tm-08b and subtasks](../README.md)
- **Tasks:** tm-08b → tm-lvk → tm-1u6 → tm-nqy → tm-31x, tm-cqa
- **Key ideas:** Coordinator as single-writer task broker, one clone per worker, pipeline field for lane separation (e.g. `lean | prove | verify`), no branches needed — clone isolation is sufficient

### Backlog Reliability
- **tm-apy:** Fix backlog truncation race condition (worker + overseer writing simultaneously)
- May be resolved by coordinator pattern in parallel workers (single writer)

### Schema Simplification
- **tm-psn:** Remove `size` and `type` fields, merge `title`/`description` (first line = title)
- Both fields are vestigial — not used for real logic

### Worker Bugs
- **tm-bym:** Worker log stops updating mid-task (session events stop flowing to log file)

## Medium-term

### Dialogue Overseer
Replace heartbeat monologue with adversarial critic/planner dialogue.

- **Design:** [docs/design-dialogue-overseer.md](design-dialogue-overseer.md)
- **Task:** tm-tio
- **Key ideas:** Two agents in structured turn-taking — Critic challenges, Planner defends and executes. Exploits RLHF helpfulness training (each agent sees the other as "user"). Cross-model dialogue (Claude + Gemini) maximizes uncorrelated errors. Randomize model assignments per cycle.

### Model Randomization
Randomly select from available models per tier instead of always using the first. Increases search diversity — different training data → different intuitions → different failure modes.

- Applies to workers (explore tasks), dialogue roles, and overseer
- Cheap to implement: `strategy: random` in model tier config

### Dead Ends Tracking
Verify agents append to `proofs/dead-ends.md` on rejection. Explorers and advisors read it before starting work. Prevents repeating failed approaches.

- Already in workflow prompts, needs validation in practice

## Longer-term

### Bidirectional Search / 3-Strike Rule
When forward (NL proofs) and backward (Lean skeleton) can't meet, move the meeting point. After 3 failed attempts on the same sorry, redesign the proof architecture rather than retrying.

- **Design:** Integrated into [math-research advisor prompt](../workflows/math-research/advisor.md)
- **Learned from:** Erdős 410 experiment — 9 attempts on same lemma before human intervention

### Inter-Agent Communication
Peer-to-peer messaging between parallel workers. Explore agent asks formalize agent about available Mathlib lemmas mid-task. Async, optional, via custom tools (`send_message`, `check_messages`).

### Competing Proof Skeletons
Advisor creates multiple Lean proof structures with different sorry decompositions. Workers fill whichever skeleton's sorrys they can reach first. Prevents lock-in to a single proof architecture.

## Research / Experimental

### Agent Anthropology
Ongoing observations from the Erdős 410 dual experiment.

- **Notes:** [docs/anthropology-erdos-410.md](anthropology-erdos-410.md)
- **Lessons:** [docs/lessons-learned-erdos-experiments.md](lessons-learned-erdos-experiments.md)
- **Key findings:** Path dependence, agents ignore hints, persistence trap, RLHF exploitation hypothesis

### Math Research Workflow
Purpose-built workflow for autonomous mathematical proof discovery.

- **Design:** [docs/math-research-workflow-design.md](math-research-workflow-design.md)
- **Workflow files:** [workflows/math-research/](../workflows/math-research/)
