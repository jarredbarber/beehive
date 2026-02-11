# Stale Task Detection and Recovery - Demo

This document demonstrates the stale task detection and recovery feature in beehive.

## Problem

Tasks can get stuck in `in_progress` state when:
- A worker process crashes or is killed unexpectedly
- The system reboots while a worker is running
- Network issues cause a worker to disconnect
- A background worker daemon stops responding

These "stale" tasks block the workflow because no worker is actively processing them, but they remain claimed.

## Solution

Beehive provides two commands to detect and recover from stale tasks:

### 1. Detect Stale Tasks

```bash
# Default timeout (60 minutes)
bh worker stale

# Output:
# 🔍 Stale Task Detection (timeout: 60 minutes)
# ================================================================================
# 
# Total in_progress tasks: 3
# Stale tasks found: 1
# 
# ⚠️  Stale tasks:
# 
#   tm-abc - Implement user authentication
#     Role: code
#     Last updated: 2026-02-07T12:30:15.123Z (95 minutes ago)
#     Status: Processing OAuth flow...
#     Session: a4409e7b-1856-4f80-99fe-bc9faafdd5ff
# 
# 💡 To recover these tasks, run:
#    bh worker recover --timeout 60
```

**Custom timeout:**

```bash
# Detect tasks inactive for >30 minutes
bh worker stale --timeout 30

# Detect tasks inactive for >2 hours (120 minutes)
bh worker stale --timeout 120
```

**JSON output for scripting:**

```bash
bh worker stale --json

# Output:
# {
#   "totalInProgress": 3,
#   "staleTasks": 1,
#   "timeoutMinutes": 60,
#   "tasks": [
#     {
#       "id": "tm-abc",
#       "title": "Implement user authentication",
#       "role": "code",
#       "updatedAt": "2026-02-07T12:30:15.123Z",
#       "ageMinutes": 95,
#       "sessionId": "a4409e7b-1856-4f80-99fe-bc9faafdd5ff",
#       "status": "Processing OAuth flow..."
#     }
#   ]
# }
```

### 2. Recover Stale Tasks

**Preview recovery (dry-run):**

```bash
bh worker recover --dry-run

# Output:
# 🔧 Stale Task Recovery (timeout: 60 minutes) [DRY RUN]
# ================================================================================
# 
# Found 1 stale task(s):
# 
#   tm-abc - Implement user authentication
#     Last updated: 95 minutes ago
#     → Would reset to open state
# 
# 💡 Run without --dry-run to actually recover these tasks
```

**Actually recover:**

```bash
bh worker recover

# Output:
# 🔧 Stale Task Recovery (timeout: 60 minutes)
# ================================================================================
# 
# Found 1 stale task(s):
# 
#   tm-abc - Implement user authentication
#     Last updated: 95 minutes ago
#     ✓ Reset to open state
# 
# ✅ Recovered 1 task(s)
```

**Custom timeout:**

```bash
# Recover tasks inactive for >30 minutes
bh worker recover --timeout 30
```

## Workflow Example

### Scenario: Worker Crashes Mid-Task

1. Worker starts processing task `tm-xyz`:
   ```bash
   bh worker
   # Processing task: tm-xyz - Fix login bug
   # [worker crashes]
   ```

2. After the crash, the task is stuck in `in_progress`:
   ```bash
   bh list
   # ◐ tm-xyz - Fix login bug (Priority: 1)
   ```

3. Detect the stale task (after 60+ minutes of inactivity):
   ```bash
   bh worker stale
   # ⚠️  Stale tasks:
   #   tm-xyz - Fix login bug
   #     Last updated: 75 minutes ago
   ```

4. Recover the task:
   ```bash
   bh worker recover
   # ✓ Reset to open state
   ```

5. Task is now available for the next worker:
   ```bash
   bh list --ready
   # ○ tm-xyz - Fix login bug (Priority: 1)
   ```

6. Resume work:
   ```bash
   bh worker --resume
   # If the task has a sessionId, the worker will resume the previous session
   ```

## Automation

You can automate stale detection with a cron job or systemd timer:

### Cron Example

```bash
# Run every hour
0 * * * * cd /path/to/project && bh worker stale --timeout 60 >> /var/log/tm-stale.log 2>&1

# Automatically recover stale tasks every 2 hours
0 */2 * * * cd /path/to/project && bh worker recover --timeout 60 >> /var/log/tm-recover.log 2>&1
```

### Systemd Timer Example

Create `/etc/systemd/system/tm-stale-check.service`:

```ini
[Unit]
Description=Check for stale bh tasks

[Service]
Type=oneshot
WorkingDirectory=/path/to/project
ExecStart=/usr/local/bin/bh worker stale --timeout 60
```

Create `/etc/systemd/system/tm-stale-check.timer`:

```ini
[Unit]
Description=Run stale task check every hour

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

Enable and start:

```bash
sudo systemctl enable tm-stale-check.timer
sudo systemctl start tm-stale-check.timer
```

## Best Practices

1. **Choose appropriate timeouts**: 
   - Short tasks (< 30 min): Use `--timeout 30`
   - Medium tasks (30-120 min): Use `--timeout 60` (default)
   - Long tasks (> 2 hours): Use `--timeout 120` or higher

2. **Always use --dry-run first**: Preview what would be recovered before making changes

3. **Monitor regularly**: Set up automated checks to catch stale tasks early

4. **Session preservation**: Tasks with `sessionId` can be resumed with `bh worker --resume` to continue where they left off

5. **Review recovered tasks**: After recovery, check if the task needs manual cleanup or can proceed normally

## Implementation Details

- **Detection logic**: Compares `task.updatedAt` timestamp to current time
- **State filter**: Only checks tasks in `in_progress` state
- **Recovery action**: Uses `manager.reopenTask()` to reset state to `open`
- **Session preservation**: `sessionId` is preserved during recovery for potential resumption
- **Git safety**: No git operations are performed during recovery (unlike normal task completion)

## Troubleshooting

**Q: Why isn't my task being detected as stale?**

A: Check the task's `updatedAt` field:
```bash
bh show <task-id> --json | jq '.updatedAt'
```

If it was recently updated (e.g., by status updates), it won't be considered stale.

**Q: What happens to the sessionId after recovery?**

A: The `sessionId` is preserved. If you run `bh worker --resume`, it will attempt to resume the session if possible.

**Q: Can I force recovery of a specific task?**

A: Yes, use `bh reopen <task-id>` to manually reset a task to `open` state regardless of staleness.

**Q: What if I have multiple stale tasks?**

A: `bh worker recover` will reset all stale tasks matching the timeout threshold. Use `--dry-run` to preview first.

## See Also

- [README.md](../README.md#agent-based-task-execution) - Worker documentation
- [CLAUDE.md](../CLAUDE.md#stale-task-detection-and-recovery) - Developer guide
- [src/tests/stale-detection.test.ts](../src/tests/stale-detection.test.ts) - Test suite
