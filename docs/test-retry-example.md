# Test Command Retry with Feedback - Example

## Overview

When a task's `testCommand` fails, the worker automatically:
1. Captures the error output (stderr and stdout)
2. Provides the error to the agent as feedback
3. Allows the agent to fix the issue
4. Retries the test automatically
5. Repeats up to N times (configurable via `testRetries`)

## Configuration

Add to `.bh/config.json`:

```json5
{
  "testRetries": 3  // Default is 3. Set to 1 to disable retries.
}
```

## Example Usage

### Step 1: Create a task with a test command

```bash
bh create \
  -t "Fix broken tests" \
  -r code \
  -p 2 \
  --test-command "npm test"
```

### Step 2: Run the worker

```bash
bh worker
```

### How it works

When the agent completes the task:

1. **Initial test run**
   ```
   🧪 Running test command: npm test
   ```

2. **If test fails** (attempt 1/3)
   ```
   ❌ Test command failed (attempt 1/3)
   🔄 Providing test failure feedback to agent for retry...
   ```

   The agent receives:
   ```
   # Test Command Failed
   
   The test command failed. Please analyze the error output, 
   fix the issues, and prepare for another test attempt.
   
   **Test command:** `npm test`
   
   **Attempt:** 1/3
   
   **Error output:**
   ```
   FAIL src/utils/parser.test.ts
     ✕ should parse markdown correctly (15 ms)
   
   Expected: "hello world"
   Received: "hello worl"
   ```
   
   **Instructions:**
   1. Analyze the error output above
   2. Identify what went wrong
   3. Fix the issues using your available tools
   4. The test will be run automatically after you finish
   ```

3. **Agent fixes the issue**
   ```
   Agent: "I see the issue - there's a typo in the parser. 
          Let me fix it..."
   
   $ edit src/utils/parser.ts
   [... agent makes changes ...]
   ```

4. **Automatic retry**
   ```
   🧪 Running test command: npm test
   ✅ Test command passed (attempt 2/3)
   ```

5. **Task completes successfully**
   ```
   ✅ Closed task tm-abc
   📝 Committing changes...
   ```

## Benefits

- **Self-correcting workflows**: Agents can fix test failures without human intervention
- **Faster iteration**: No need to manually re-run failed tasks
- **Learning from errors**: Agents see actual error messages and can fix the root cause
- **Configurable retries**: Adjust the number of attempts based on your needs

## When to use testCommand

Good candidates for test commands:
- `npm test` - Run unit tests
- `pytest` - Python tests  
- `cargo test` - Rust tests
- `make test` - Custom test target
- `./scripts/validate.sh` - Custom validation script
- `eslint src/` - Linting
- `tsc --noEmit` - Type checking

## Limitations

- The agent must be capable of fixing the issue using its available tools
- Complex issues may require human intervention even with retries
- Each retry consumes model tokens and time
- If all retries fail, the task is marked as `failed` and git changes are rolled back

## Advanced: Per-task retry configuration

While `testRetries` is configured globally, you can create tasks with different test commands based on complexity:

```bash
# Simple task - fewer retries needed
bh create \
  -t "Fix typo" \
  -r code \
  --test-command "npm run lint"

# Complex task - may need more attempts
# (Use config to set testRetries higher for the whole project)
bh create \
  -t "Refactor authentication system" \
  -r code \
  --test-command "npm test && npm run integration-test"
```

## Troubleshooting

**Issue**: Tests keep failing even after retries

**Solution**: Check the log file to see what the agent attempted:
```bash
cat .bh/logs/worker-tm-abc.md
```

**Issue**: Want to disable retries for a specific workflow

**Solution**: Set `testRetries: 1` in `.bh/config.json`:
```json5
{
  "testRetries": 1  // Only run test once, fail immediately
}
```

**Issue**: Agent is not fixing the right issue

**Solution**: The agent receives the raw error output. Make sure your test framework provides clear error messages. Consider adding custom validation scripts that output helpful hints.
