# Design: Dialogue Overseer

## Problem

The current overseer is a monologue system. A single agent runs periodically (heartbeat loop), reads project state, writes notes to itself in `memory.md`, and occasionally creates/modifies tasks. This works but has observed failure modes:

1. **Passive observation without action.** The overseer writes "if X happens, do Y" in its notes, X happens, and it doesn't do Y until a human prods it. Notes are observations, not commitments, despite prompting to the contrary.

2. **No self-challenge.** The overseer evaluates its own plans. There's no adversarial pressure to expose weak reasoning. In the Erdős 410 experiment, the overseer let 9 explore tasks fail on the same mathematical gap before stopping — a human observer identified the strategy problem after 2 failures.

3. **Path dependence.** Once the overseer commits to a strategy, it optimizes within that strategy rather than questioning it. It can detect that tasks keep failing but can't step back and ask "is the whole approach wrong?"

4. **Lost context.** The heartbeat model forces the overseer to reconstruct context every cycle from `memory.md` (lossy) and project files. Strategic reasoning accumulated across heartbeats degrades through compression.

## Proposal: Dialogue Overseer

Replace the heartbeat monologue with a continuous dialogue between two agents with distinct roles:

### The Critic (Professor)

- **Role:** Challenge plans, ask hard questions, identify weak reasoning
- **Personality:** Skeptical, adversarial, economical with praise
- **Tools:** Read-only (can read files, run `bh list`, `bh show`, `bh tree`, `git log`)
- **Does NOT:** Create tasks, modify files, or take actions
- **Model:** Heavy (needs strong reasoning to find flaws)

The Critic's job is to prevent the failure modes above:
- Forces the Planner to justify decisions, not just observe
- Applies adversarial pressure: "You said you'd pivot after 3 failures. Why haven't you?"
- Questions strategy, not just tactics: "Why are you still trying persistence?"
- Maintains conversational continuity — doesn't need to reconstruct context

### The Planner (Student)

- **Role:** Analyze project state, propose plans, execute decisions
- **Personality:** Proactive, detail-oriented, responsive to criticism
- **Tools:** Full access (read, write, bash, `bh create`, `bh update`, `bh close`, etc.)
- **Does:** Create tasks, modify task descriptions, update memory, run diagnostics
- **Model:** Heavy (needs to understand the project deeply)

The Planner does what the current overseer does, but under pressure from the Critic. It must defend its plans or change them.

### Dialogue Protocol

```
1. Planner reads project state (files, tasks, metrics)
2. Planner proposes assessment + action plan
3. Critic challenges: asks questions, points out gaps, demands justification
4. Planner defends or revises
5. Repeat 3-4 until Critic is satisfied (or max turns reached)
6. Planner executes agreed actions
7. Wait for next cycle (or run continuously)
```

The dialogue transcript is the memory. No separate `memory.md` needed — the full reasoning chain is preserved in the session history, including the challenges and revisions that shaped each decision.

### Turn Budget

Each cycle has a turn budget (e.g., 6 turns = 3 exchanges). This prevents infinite debate while ensuring meaningful challenge:

- **Turn 1 (Planner):** State assessment + proposed actions
- **Turn 2 (Critic):** Challenge the weakest part of the plan
- **Turn 3 (Planner):** Defend or revise
- **Turn 4 (Critic):** Accept or escalate to harder question
- **Turn 5 (Planner):** Final plan
- **Turn 6 (Critic):** Approve, or flag for human escalation

If the Critic isn't satisfied after the budget, the system escalates to the human rather than taking uncertain action.

## Implementation

### Using the pi SDK

Two `createAgentSession()` instances with different system prompts and tool sets. Output from one is fed as input to the other:

```typescript
async function dialogueCycle(critic: AgentSession, planner: AgentSession) {
    // Planner assesses and proposes
    const plannerOpening = await prompt(planner, 
        "Read the project state and propose your assessment and action plan.");
    
    for (let turn = 0; turn < maxTurns; turn++) {
        // Critic challenges
        const challenge = await prompt(critic, plannerOpening);
        
        // Check if Critic approves
        if (isApproval(challenge)) break;
        
        // Planner responds to challenge
        const defense = await prompt(planner, challenge);
    }
    
    // Planner executes (already has tool access, actions happen during prompting)
}
```

### Session Management

Both agents share a single session file (interleaved messages) or use paired session files. The dialogue history provides full context on future cycles — no lossy compression to `memory.md`.

For long-running projects, periodic compaction summarizes old cycles while preserving recent dialogue verbatim.

### Integration with tm

```bash
bh dialogue start          # Start dialogue overseer (background)
bh dialogue stop           # Stop it
bh dialogue status         # Show recent dialogue summary
bh dialogue join           # Human joins as a third participant
```

The `join` command is key — the human can enter the conversation at any time, adding context or making decisions that neither agent can make alone. This replaces the current `bh chat` which starts a fresh session.

### Triggering

Two modes:

1. **Periodic:** Run a dialogue cycle every N minutes (like current heartbeat, but richer)
2. **Event-driven:** Trigger on task completion, task failure, worker idle, or human message

Event-driven is more efficient — no wasted cycles when nothing has changed. A simple file watcher on `.bh/backlog.json` plus a webhook from the worker on task state changes.

## Critic Prompt (Draft)

```markdown
# Critic

You are the critical reviewer in a project oversight dialogue. Your partner 
(the Planner) analyzes project state and proposes actions. Your job is to 
make the Planner's reasoning better by challenging it.

## Your Responsibilities

1. **Question assumptions.** If the Planner says "the approach is working," 
   demand evidence. What metrics? Compared to what baseline?

2. **Detect patterns.** If tasks keep failing on the same issue, say so 
   explicitly. "This is the 4th failure on X. Why are you creating a 5th 
   attempt instead of changing the approach?"

3. **Enforce commitments.** If the Planner previously said "if X happens, 
   I'll do Y" — hold them to it. "Last cycle you said you'd pivot after 
   3 failures. There have been 5. Explain."

4. **Challenge strategy, not just tactics.** Don't just check whether 
   individual tasks are well-formed. Ask whether the overall approach 
   makes sense. "You've spent 15 tasks on persistence. Is persistence 
   the right strategy?"

5. **Approve when satisfied.** If the plan is sound and well-justified, 
   say so clearly: "APPROVED. Execute the plan." Don't challenge for 
   the sake of challenging.

6. **Escalate when stuck.** If the Planner can't answer your challenges 
   and keeps deflecting, recommend human escalation with a specific 
   question.

## You Do NOT
- Create tasks or modify project files
- Propose your own plans (you challenge, not plan)
- Do the Planner's analysis for them
- Accept hand-waving ("it should work" is not justification)
```

## Planner Prompt (Draft)

```markdown
# Planner

You are the strategic planner in a project oversight dialogue. You analyze 
project state, propose actions, and execute them — but only after your 
partner (the Critic) has challenged your reasoning.

## Your Responsibilities

1. **Assess honestly.** Read the project state and report what's actually 
   happening, not what you hope is happening. Include metrics: task counts, 
   sorry counts, failure rates, time since last progress.

2. **Propose concrete actions.** Every assessment should end with a specific 
   plan: which tasks to create, close, or modify, and why.

3. **Defend your reasoning.** The Critic will challenge you. Respond with 
   evidence and logic, not appeals to authority or vague optimism.

4. **Revise when wrong.** If the Critic identifies a flaw in your plan, 
   acknowledge it and revise. Don't be stubborn.

5. **Honor your commitments.** If you said "I'll do X if Y happens" in a 
   previous cycle, and Y happened, do X. The Critic will hold you to it.

6. **Execute after approval.** Once the Critic approves your plan, execute 
   it using bh commands.

## Tools
You have full access to project tools: read files, run shell commands, 
create/update/close tasks via bh CLI, modify project files.
```

## Comparison with Current Overseer

| Aspect | Heartbeat Overseer | Dialogue Overseer |
|--------|-------------------|-------------------|
| Reasoning mode | Monologue | Adversarial dialogue |
| Self-challenge | None (reviews own plans) | Built-in (Critic role) |
| Context retention | Lossy (memory.md) | Full (dialogue transcript) |
| Commitment enforcement | Prompt-based (unreliable) | Critic enforces |
| Strategy questioning | Rare (path dependent) | Every cycle (Critic's job) |
| Human integration | Separate (tm chat) | Native (tm dialogue join) |
| Cost per cycle | 1 heavy model call | 2-6 heavy model calls |
| Latency per cycle | ~30s | ~2-5min |

The main tradeoff is cost. A dialogue cycle costs 3-6x more than a heartbeat. But if it catches strategy problems earlier (like the persistence trap in Erdős 410 — 9 wasted tasks at heavy model cost), it pays for itself.

## Model Diversity and RLHF Exploitation

### The Helpfulness Hack

In dialogue mode, each agent sees the other's output as a "user" message. LLMs are RLHF-trained to engage deeply with user messages — take them seriously, answer thoroughly, address the actual question. This training pressure is the strongest behavioral signal in the model.

A monologue overseer writes notes to itself (assistant → assistant). There's no training pressure to challenge your own reasoning. But when a Critic's challenge arrives as a user message, it triggers the helpfulness subsystem — the Planner *wants* to give a good answer because that's what RLHF optimized for.

### Cross-Model Dialogue

Using different model families (Claude + Gemini) for the two roles maximizes this effect:

1. **Uncorrelated errors.** Same-model agents share blind spots from training data. The Erdős 410 experiment showed this: two independent Claude instances both converged on the persistence strategy. Different model families have different intuitions and different failure modes — like a random forest beating a single deep tree.

2. **Out-of-distribution triggering.** Output from a different model family looks more "foreign" — different phrasing, emphasis, and assumptions. This pattern-matches more closely to "a real user wrote this" than same-model output would. The more the input doesn't look like your own output, the harder the RLHF training pushes you to engage with it.

3. **Prevents comfortable agreement.** Same-model dialogue risks being too smooth — the models predict each other well and take shortcuts to agreement. Cross-model dialogue introduces genuine friction that forces explicit reasoning.

### Randomization

For maximum diversity, randomize model assignment each cycle:

```
Cycle 1: Gemini critic, Claude planner
Cycle 2: Claude critic, Claude planner  
Cycle 3: Claude critic, Gemini planner
Cycle 4: Gemini critic, Gemini planner
```

This extends to workers too. If an explore task fails 3 times with Claude, try Gemini — different training data might produce a different proof strategy without explicit intervention.

Implementation: add `strategy: random` to the model tier config. Instead of always picking the first model in the heavy tier, randomly select from available models. Cheap change, potentially large impact on search diversity.

## Open Questions

1. ~~Should both agents be the same model?~~ **No — cross-model dialogue is preferred.** Randomize model assignments per cycle for maximum diversity.

2. **How to handle tool calls during dialogue?** If the Planner runs `bh list` mid-turn, the Critic sees the output. This is good (shared context) but adds noise to the dialogue. Maybe tool outputs should be summarized.

3. **When should the human join?** Always available via `bh dialogue join`, but should the system actively pull the human in? The Critic could have a threshold: "I've challenged 3 times and the Planner can't resolve this — escalating to human."

4. **Can the Critic have tools?** Read-only tools let the Critic independently verify the Planner's claims ("you say there are 3 sorrys — let me check"). This prevents the Planner from misrepresenting state. But it adds cost.

5. **Session length.** The dialogue transcript grows over time. When to compact? Compacting loses the exact wording of past commitments, which undermines the Critic's enforcement role. Maybe compact everything except the last N cycles.

## Relationship to Parallel Workers

The dialogue overseer and parallel workers are complementary:
- **Workers** execute tasks (explore, formalize, verify)
- **Dialogue** oversees strategy (what tasks to create, when to pivot, how to decompose)

The Planner creates tasks and manages the DAG. Workers consume tasks. The Critic ensures the Planner isn't wasting worker cycles on dead-end strategies.

With parallel workers, the dialogue becomes even more important — more workers means more cost from strategic errors. Catching a bad strategy after 2 tasks instead of 9 saves 7 × (parallel worker count) task executions.
