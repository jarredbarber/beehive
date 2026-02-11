# Archive Documentation

This directory contains historical design documents, implementation notes, and task summaries that provide context for the evolution of the beehive project.

## Contents

### Design Documents

- **DESIGN-HUMAN-GATE.md** - Detailed design specification for the human gate/input gate feature that allows AI agents to request human input during task execution. This feature is now fully implemented.

- **GEMINI_CLI.md** - Design proposal for integrating a corporate `gemini-cli` binary as an LLM provider for the beehive worker harness. This describes future functionality for using CLI-based model access.

### Implementation Summaries

- **IMPLEMENTATION.md** - Original implementation summary from when the core bh CLI was first completed. Documents the initial success criteria and verification results.

- **STREAMING_LOGS.md** - Documentation of the real-time worker log streaming feature that writes agent execution logs to `.bh/logs/worker-<id>.md` files. This feature is now implemented and documented in the main README.md.

- **WORKFLOW_IMPROVEMENTS.md** - Summary of improvements made to the coding workflow, including the creation of the shared preamble, agent escalation sections, and CLI syntax fixes. All improvements described here have been completed.

### Implementation Examples

- **example-prompt-with-response.md** - Example showing how the `buildUserPrompt()` function includes human responses when resuming tasks from the `awaiting_input` state. Demonstrates the before/after format.

### Task Summaries

- **CLEANUP_SUMMARY.md** - Completion summary from task tm-jxk which performed a comprehensive codebase cleanup, documentation updates, and file reorganization after the removal of the agents directory.

## Why Archive?

These documents were originally in the project root but have been moved to this archive directory to:

1. **Reduce root clutter** - Keep the project root focused on essential files (README, CLAUDE, CHANGELOG)
2. **Preserve history** - Maintain design rationale and implementation context for future reference
3. **Improve discoverability** - Organize related documents in a logical directory structure

## Current Documentation

For current, user-facing documentation, see:

- **README.md** (root) - User guide and feature documentation
- **CLAUDE.md** (root) - Developer guide and architecture documentation
- **CHANGELOG.md** (root) - Version history and release notes
- **workflows/CUSTOM.md** - Guide for creating custom agents and workflows
