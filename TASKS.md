# Beehive Implementation Tasks

This document tracks the tasks required to implement the distributed Beehive architecture as described in `docs/DESIGN.md`.

## Phase 1: Core Data Layer & Types
- [x] Define shared interfaces in `src/types.ts`
- [x] Implement `TaskStore` shared logic
- [x] Implement `LocalTaskStore`

## Phase 2: REST API (Fastify Server)
- [x] Create `src/server.ts` using Fastify
- [x] Implement Project endpoints
- [x] Implement Task endpoints
- [x] Implement Bee lifecycle endpoints
- [x] Implement Admin endpoints
- [x] Implement context endpoints

## Phase 3: Auth & Security
- [x] Implement API Key generation and hashing (SHA-256)
- [x] Add Auth middleware to Fastify
- [x] CLI/Admin endpoints for key management

## Phase 4: Local Mode (`bh serve`)
- [ ] Implement `bh serve` command in CLI
    - [ ] Configuration for port, storage location, etc.
- [ ] Update CLI commands to optionally talk to a server instead of local files
    - [ ] `BH_SERVER` and `BH_KEY` environment variable support
    - [ ] Refactor CLI commands to use an `ApiClient` when `BH_SERVER` is set

## Phase 5: Cloudflare Worker & D1
- [x] Create `worker/` directory with `wrangler.toml`
- [x] Implement `worker/schema.sql` (D1 Schema)
- [x] Port Fastify logic to Cloudflare Worker using Hono
- [x] Implement Auth middleware with D1 and Web Crypto
- [x] Implement dump/load bulk operations

## Phase 6: GitHub Integration & Webhooks
- [x] Implement GitHub webhook handler
    - [x] Signature verification
    - [x] Handle `pull_request.closed` (merged) event
    - [x] Auto-execute pending submissions on merge
- [ ] Add `octokit` integration to server for:
    - [ ] PR commenting on rejection
    - [ ] Auto-merge on approval (optional/configurable)

## Phase 7: CLI Updates & Tooling
- [x] Create `src/api-client.ts` for REST API communication
- [x] `bh claim` (Updated to support `BH_SERVER` mode)
- [x] `bh next` (Updated to support `BH_SERVER` mode)
- [x] `bh submit` (New command: git push, create PR, post to hive)
- [x] `bh approve` / `bh reject` (New admin commands)
- [x] `bh dump` / `bh load` (Bulk project operations)

## Phase 8: Refinement & Advanced Features
- [ ] Heartbeat/Stale task recovery mechanism (D1 Cron or background task)
- [ ] Notification webhooks (Telegram, Slack)
- [ ] Gzipped log storage in D1
