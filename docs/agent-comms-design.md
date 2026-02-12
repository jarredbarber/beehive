# Agent-to-Agent Communications Infrastructure Design

**Date:** 2026-02-12  
**Author:** beehive-tpm  
**Status:** Draft for Review

## Executive Summary

This document evaluates four architectural options for agent-to-agent communication infrastructure to support multi-agent collaboration experiments. The current custom system (pi-teams) works but lacks persistence, observability, and scalability features needed for production use.

**Recommendation:** Enhanced Custom + Zulip Mirror (Hybrid Option)
- Keep custom hub for low-latency agent-to-agent messaging
- Add Zulip as read-only mirror for human observability and persistent search
- Migration cost: ~300 LOC, 2-3 days
- Best balance of performance, observability, and operational simplicity

---

## Current System Analysis

### Architecture

**Components:**
- `team-hub.js`: Node.js HTTP server on port 3141 (~135 LOC)
- `team-bridge.ts`: Pi extension providing tools (~164 LOC)
- In-memory message queues (Map-based)
- HTTP polling every 3 seconds

**Features:**
- Agent discovery (`/agents` - who's online)
- Point-to-point messaging (`/send` to specific agent)
- Group broadcast (`/send` to group name, fan-out to all members)
- Heartbeat tracking (15s timeout for "online" status)

**Data from 6-agent experiments:**
- 2 requests/second to hub (6 agents × 3s poll interval)
- Explore agent: 57% of bash commands were git operations
- Session `.jsonl` files are source of truth for reconstruction
- No message persistence (lost on hub restart)
- No human observability (can't see agent conversations)

### Current Limitations

1. **No Persistence:** Messages lost on restart
2. **No Observability:** Humans can't watch agent conversations in real-time
3. **No History:** Can't search past messages (only in session logs)
4. **No Intervention:** Humans can't send messages to agents easily
5. **Polling Overhead:** 3-second HTTP polling creates constant load
6. **No Backpressure:** Unbounded queue growth if agent is offline

---

## Option 1: Enhanced Custom

**Approach:** Build on existing pi-teams hub + beehive infrastructure.

### Architecture Changes

```
┌─────────────────────────────────────────────────────┐
│                   Pi Team Hub                        │
│  (Enhanced with persistence + observability)         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐    ┌─────────────┐               │
│  │ HTTP Server  │────│  WebSocket  │ (new)          │
│  │ (existing)   │    │  for agents │               │
│  └──────────────┘    └─────────────┘               │
│         │                    │                       │
│         ▼                    ▼                       │
│  ┌─────────────────────────────────┐               │
│  │   Message Queue + Router        │               │
│  └─────────────────────────────────┘               │
│         │                    │                       │
│         ▼                    ▼                       │
│  ┌─────────────┐      ┌────────────┐               │
│  │   SQLite    │      │ Web UI     │ (new)          │
│  │ (messages)  │      │ Dashboard  │               │
│  └─────────────┘      └────────────┘               │
└─────────────────────────────────────────────────────┘
```

### Changes Required

**1. Add SQLite persistence** (~50 LOC)
```javascript
// Schema
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  sender TEXT,
  target TEXT,
  text TEXT,
  is_group BOOLEAN,
  timestamp INTEGER
);

CREATE INDEX idx_target_time ON messages(target, timestamp);
```

**2. Add WebSocket support** (~100 LOC)
- Replaces HTTP polling
- Agents maintain persistent connection
- Push messages immediately (no 3s delay)
- Falls back to HTTP if WebSocket fails

**3. Add Web Dashboard** (~150 LOC)
- Real-time message viewer (WebSocket to browser)
- Agent status (online/offline)
- Message history search
- Send message to agent (human intervention)

**4. Update team-bridge.ts** (~20 LOC)
- Add WebSocket support to `remote_prompt` tool
- Fallback to HTTP polling if WebSocket unavailable

### Migration Cost

| Component | LOC | Effort |
|-----------|-----|--------|
| SQLite persistence | 50 | 0.5 days |
| WebSocket server | 100 | 1 day |
| Web dashboard | 150 | 1.5 days |
| Bridge updates | 20 | 0.5 days |
| **Total** | **320** | **3.5 days** |

### Rate Limits

- **No external rate limits** (self-hosted)
- WebSocket eliminates polling overhead
- Database writes: ~10-20 msg/sec sustainable
- Message queue bounded by memory (add max queue size)

### Operational Complexity

**Run:**
- 1 Node.js process (team-hub)
- 1 SQLite database file
- Optional: nginx reverse proxy for HTTPS

**Monitor:**
- Process health (systemd/pm2)
- Database size
- WebSocket connection count

**Backup:**
- SQLite database (single file)
- Agent session `.jsonl` files (existing)

### Pros

- ✅ Full control over architecture
- ✅ No external dependencies or rate limits
- ✅ Minimal operational complexity
- ✅ ~300 LOC total (very maintainable)
- ✅ Zero migration cost for agents (tools stay the same)
- ✅ WebSocket eliminates polling overhead

### Cons

- ❌ Build everything ourselves (dashboard, search, etc.)
- ❌ SQLite doesn't scale to multi-machine (single server only)
- ❌ No rich formatting (markdown, syntax highlighting)
- ❌ Basic UI compared to mature chat platforms

---

## Option 2: Zulip

**Approach:** Replace hub with Zulip open-source chat server.

### Architecture

```
┌─────────────────────────────────────┐
│          Zulip Server                │
│     (Self-hosted, PostgreSQL)        │
├─────────────────────────────────────┤
│  Topics = Agent Conversations        │
│  Streams = Projects/Teams            │
└─────────────────────────────────────┘
         ▲                 ▲
         │                 │
    ┌────┴─────┐     ┌────┴────────┐
    │  Agents  │     │  Humans     │
    │ (bot API)│     │ (web/mobile)│
    └──────────┘     └─────────────┘
```

### Changes Required

**1. Replace team-hub.js with Zulip bot client** (~150 LOC)
- Zulip bot subscribes to streams
- On message: route to target agent's queue
- Agent polling fetches from Zulip API

**2. Update team-bridge.ts** (~100 LOC)
- `remote_prompt`: POST to Zulip API (send message to topic)
- `list_remote_agents`: Query Zulip for online bots
- Handle Zulip API authentication

**3. Setup Zulip server**
- Docker container or VM
- PostgreSQL database
- Configure streams and bots

### Migration Cost

| Component | LOC | Effort |
|-----------|-----|--------|
| Zulip bot client | 150 | 1.5 days |
| Bridge updates | 100 | 1 day |
| Zulip setup/config | - | 1 day |
| Testing/debugging | - | 1 day |
| **Total** | **250** | **4.5 days** |

### Rate Limits

**Zulip API limits:**
- 200 requests/min per bot (default)
- 6 agents × 20 polls/min = 120 req/min ✅ (within limit)
- Configurable (self-hosted)

### Operational Complexity

**Run:**
- Zulip Docker container (PostgreSQL, Redis, memcached, nginx)
- ~1GB RAM minimum
- Docker Compose orchestration

**Monitor:**
- Multi-container health
- PostgreSQL backups
- Redis memory usage
- Disk space (message history)

**Backup:**
- PostgreSQL database dumps
- Zulip config files

### Pros

- ✅ Full-featured chat platform (markdown, syntax highlighting, reactions)
- ✅ Excellent search (PostgreSQL full-text)
- ✅ Topic-based threading (perfect for agent conversations)
- ✅ Mobile apps, desktop clients
- ✅ Rich API (webhooks, integrations)
- ✅ Human and agents in same interface
- ✅ Persistent history out of the box

### Cons

- ❌ Heavy infrastructure (PostgreSQL, Redis, memcached)
- ❌ Overkill for agent-only messaging
- ❌ Agent messages pollute human chat
- ❌ API rate limits (though configurable)
- ❌ Migration cost higher than custom
- ❌ Polling still required (Zulip has no WebSocket for bots)

---

## Option 3: Discord

**Approach:** Use Discord bot API for agent messaging.

### Architecture

```
┌─────────────────────────────────────┐
│         Discord Server               │
│       (Cloud-hosted, free)           │
├─────────────────────────────────────┤
│  Channels = Agent Conversations      │
│  Threads = Sub-conversations         │
└─────────────────────────────────────┘
         ▲                 ▲
         │                 │
    ┌────┴─────┐     ┌────┴────────┐
    │  Agents  │     │  Humans     │
    │ (bots)   │     │ (Discord UI)│
    └──────────┘     └─────────────┘
```

### Changes Required

**1. Discord bot client** (~120 LOC)
- Discord.js bot framework
- WebSocket gateway connection
- Route messages to agent queues

**2. Update team-bridge.ts** (~80 LOC)
- `remote_prompt`: POST to Discord API
- `list_remote_agents`: Query Discord presence
- Handle bot authentication

**3. Discord server setup**
- Create Discord server
- Configure channels for projects
- Create bot applications
- Generate bot tokens

### Migration Cost

| Component | LOC | Effort |
|-----------|-----|--------|
| Discord bot | 120 | 1 day |
| Bridge updates | 80 | 0.5 days |
| Discord setup | - | 0.5 days |
| Testing | - | 0.5 days |
| **Total** | **200** | **2.5 days** |

### Rate Limits

**Discord API limits:**
- 50 requests/sec globally
- 5 requests/sec per channel
- 6 agents in same channel = potential limit ⚠️
- No control (cloud service)

### Operational Complexity

**Run:**
- 1 Node.js bot process
- Discord handles hosting (zero ops)

**Monitor:**
- Bot process health
- API rate limit alerts

**Backup:**
- Discord keeps message history
- Export via API if needed

### Pros

- ✅ Zero infrastructure (Discord hosts everything)
- ✅ WebSocket (no polling - push notifications)
- ✅ Rich UI (markdown, code blocks, threads)
- ✅ Free tier sufficient
- ✅ Mobile/desktop apps
- ✅ Lowest migration cost
- ✅ Easiest to operate

### Cons

- ❌ No self-hosting (cloud dependency)
- ❌ Rate limits beyond our control
- ❌ Agent spam pollutes human channels
- ❌ Privacy concerns (Discord ToS, data storage)
- ❌ API changes out of our control
- ❌ 5 req/sec per channel may limit agent bursts

---

## Option 4: Hybrid (Enhanced Custom + Zulip Mirror)

**Approach:** Keep custom hub for agent-to-agent, mirror to Zulip for human observability.

### Architecture

```
┌────────────────────────────────────────────────────┐
│                 Pi Team Hub                         │
│        (Fast agent-to-agent messaging)              │
│  ┌──────────────┐         ┌────────────┐          │
│  │  WebSocket   │────────│   SQLite    │          │
│  │  (agents)    │         │  (history)  │          │
│  └──────────────┘         └────────────┘          │
│         │                        │                  │
│         └────────────┬───────────┘                  │
│                      │                              │
│                      ▼                              │
│              ┌──────────────┐                      │
│              │ Zulip Mirror │ (webhook)             │
│              └──────────────┘                      │
└────────────────────────────────────────────────────┘
                       │
                       ▼
         ┌───────────────────────────┐
         │      Zulip Server         │
         │ (Read-only for humans)    │
         └───────────────────────────┘
                  ▲
                  │
            ┌─────┴──────┐
            │   Humans   │
            └────────────┘
```

### Design

**Agent-to-Agent:**
- Custom hub (WebSocket + SQLite)
- Low latency, no external deps
- Agents unaware of Zulip

**Human Observability:**
- Hub sends messages to Zulip via webhook
- Humans read/search in Zulip
- (Optional) Humans can send to agents via Zulip bot

### Changes Required

**1. Enhanced hub (from Option 1)** (~200 LOC)
- WebSocket support
- SQLite persistence
- Zulip webhook integration

**2. Zulip mirror service** (~50 LOC)
- Subscribe to hub message events
- POST to Zulip API
- Format agent messages for readability

**3. Bridge updates** (~20 LOC)
- Add WebSocket support (from Option 1)

### Migration Cost

| Component | LOC | Effort |
|-----------|-----|--------|
| Enhanced hub | 200 | 2 days |
| Zulip mirror | 50 | 0.5 days |
| Bridge updates | 20 | 0.5 days |
| Zulip setup | - | 1 day |
| **Total** | **270** | **4 days** |

### Rate Limits

**Agent-to-Agent:**
- No limits (custom hub)

**Human Observability:**
- Zulip: 200 req/min (webhook POST rate)
- 10-20 agent messages/sec = ~600-1200/min ⚠️
- May need to batch mirror updates

### Operational Complexity

**Run:**
- 1 Node.js hub process
- 1 Zulip Docker container
- 1 SQLite database

**Monitor:**
- Hub health
- Zulip container health
- Mirror service webhook queue

**Backup:**
- SQLite (hub messages)
- PostgreSQL (Zulip messages)

### Pros

- ✅ Best of both worlds
- ✅ Agent performance (no Zulip overhead)
- ✅ Human observability (full Zulip features)
- ✅ Agents unaware of Zulip (clean separation)
- ✅ Can disable Zulip without breaking agents
- ✅ Full control over agent messaging
- ✅ Rich human interface

### Cons

- ❌ Most complex architecture
- ❌ Two systems to maintain
- ❌ Message duplication (SQLite + PostgreSQL)
- ❌ Webhook batching needed for high message rates
- ❌ Highest operational complexity

---

## Comparison Matrix

| Criteria | Enhanced Custom | Zulip | Discord | Hybrid |
|----------|----------------|-------|---------|--------|
| **Migration Cost** | 320 LOC, 3.5 days | 250 LOC, 4.5 days | 200 LOC, 2.5 days | 270 LOC, 4 days |
| **Agent Latency** | ✅ WebSocket, instant | ⚠️ Poll 200ms | ✅ WebSocket, instant | ✅ WebSocket, instant |
| **Rate Limits** | ✅ None | ⚠️ 200/min | ❌ 5/sec/channel | ✅ None (agents) |
| **Human Observability** | ⚠️ Basic UI | ✅ Excellent | ✅ Excellent | ✅ Excellent |
| **Message Search** | ⚠️ SQLite FTS | ✅ PostgreSQL FTS | ✅ Discord search | ✅ PostgreSQL FTS |
| **Self-Hosted** | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| **Operational Cost** | ✅ Low (1 process) | ⚠️ Medium (Docker) | ✅ Low (1 bot) | ❌ High (hub + Zulip) |
| **Agent Pollution** | ✅ N/A (agent-only) | ❌ Agents in chat | ❌ Agents in chat | ✅ Separated |
| **Rich Formatting** | ❌ Plain text | ✅ Markdown | ✅ Markdown | ✅ Markdown (Zulip) |
| **Mobile Access** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes (Zulip) |

---

## Recommendation

**Option 4: Hybrid (Enhanced Custom + Zulip Mirror)**

### Reasoning

1. **Agent Performance:** Custom hub keeps agent-to-agent messaging fast and dependency-free. No external rate limits.

2. **Human Observability:** Zulip provides production-quality chat UI, search, and mobile access without compromising agent performance.

3. **Clean Separation:** Agents don't know about Zulip. We can disable the mirror without breaking agent workflows.

4. **Operational Flexibility:** Can run hub standalone initially, add Zulip mirror later when needed.

5. **Future-Proof:** As agent count scales, custom hub can optimize for agent needs (batching, backpressure) without Zulip constraints.

### Implementation Plan

**Phase 1: Enhanced Hub (Week 1)**
- Add WebSocket support to team-hub.js
- Add SQLite persistence
- Add basic web dashboard for debugging
- **Agents immediately benefit from lower latency**

**Phase 2: Zulip Mirror (Week 2)**
- Setup Zulip server
- Build mirror service (webhook from hub → Zulip)
- Configure streams/topics for projects
- **Humans get full observability**

**Phase 3: Refinement (Week 3)**
- Add human → agent messaging (Zulip bot)
- Optimize mirror batching for high message rates
- Add monitoring and alerts

### Risk Mitigation

- **Zulip rate limits:** Batch mirror updates (100 messages/POST)
- **Operational complexity:** Document runbooks, automate deployment
- **Message duplication:** SQLite for agents (fast), Zulip for humans (searchable) - different purposes

---

## Appendix A: Rejected Alternatives

### Why not Enhanced Custom alone?

Building a production chat UI comparable to Zulip would take weeks. We'd recreate features like:
- Thread views
- @ mentions
- Search with filters
- Mobile apps
- Push notifications

Better to leverage existing platforms for human interface.

### Why not Zulip alone?

Agent-to-agent messaging has different requirements than human chat:
- Agents generate 10-100x more messages
- Agents need fire-and-forget (not persistent connections)
- Agent messages are structured (JSON in text)
- No need for rich formatting in agent messages

Forcing all agent traffic through Zulip adds latency and complexity.

### Why not Discord alone?

- No self-hosting (privacy concern for research data)
- Rate limits (5 req/sec per channel) insufficient for 6-agent bursts
- Cloud dependency (experiments shouldn't depend on Discord uptime)

---

## Appendix B: Session Log Integration

All options preserve existing session `.jsonl` files as source of truth:

- Hub/Zulip/Discord provide **communication layer**
- Session logs provide **state reconstruction**
- Messages may be in Zulip, but full agent state (thinking, tool calls) stays in `.jsonl`

**No changes needed** to session logging infrastructure.

---

## Appendix C: Future Considerations

### Scaling Beyond 6 Agents

- **Custom Hub:** Add Redis for multi-server message queue
- **Zulip:** Already multi-server capable (PostgreSQL backend)
- **Discord:** No changes needed (Discord handles scale)

### Agent-to-Human Direct Messaging

Hybrid architecture supports:
- Human posts in Zulip → bot relays to hub → agent receives
- Agent sends to "human:jarred" → hub sends to Zulip DM

---

**End of Document**

Questions or feedback: Send to beehive-tpm
