# Real-Time Worker Log Streaming

As of this update, `bh worker` logs are now streamed to `.bh/logs/worker-<id>.md` in real-time, enabling live monitoring of agent execution.

## Usage

### Monitor a Worker in Real-Time (Method 1: bh tail)

The easiest way to monitor logs is using the `bh tail` command:

```bash
# In one terminal, start the worker
bh worker

# In another terminal, tail the most recent task's log
bh tail

# Or tail a specific task by ID
bh tail abc
bh tail tm-abc  # Full ID also works
```

### Monitor a Worker in Real-Time (Method 2: tail -f)

You can also use the traditional `tail -f` command directly:

```bash
# In one terminal, start the worker
bh worker

# In another terminal, monitor the log file
tail -f .bh/logs/worker-<task-id>.md
```

You'll see:
- Text deltas as the agent writes them
- Thinking blocks (in blockquote format)
- Tool executions (bash commands, file operations)
- Final result

### Example

```bash
# Terminal 1: Start worker
$ bh worker --once

# Terminal 2: Monitor using bh tail (automatically finds the active task)
$ bh tail

# Or using tail -f directly (replace abc with actual task ID)
$ tail -f .bh/logs/worker-tm-abc.md
```

## Implementation Details

- Log file is created immediately when agent execution starts
- Events are appended via `appendFile()` as they occur:
  - `text_delta`: Agent's response text
  - `thinking_delta`: Agent's reasoning (in blockquotes)
  - `tool_execution_start`: Tool name and bash commands
- Final result and end timestamp are appended when execution completes

## Benefits

1. **Real-time visibility**: See what the agent is doing without waiting for completion
2. **Debugging**: Identify where execution stalls or fails
3. **Progress tracking**: Monitor long-running tasks
4. **Session recovery**: Logs are preserved even if the worker is interrupted
