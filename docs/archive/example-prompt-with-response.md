# Example: buildUserPrompt() with humanResponse

## Before (without humanResponse):

```
# Task: Implement feature X

## Description
Need to implement feature X

## Task Details
- ID: tm-abc
- Priority: 2
- Size: medium
- Type: task

## Instructions
Please complete this task using your available tools. 

**Progress Updates**: As you work, please update your progress status periodically using the CLI: `bh update tm-abc --status "Currently doing..."`. This helps the user know what you are focusing on.

When finished, provide a JSON response with your results.
```

## After (with humanResponse included):

```
# Task: Implement feature X

## Description
Need to implement feature X

## Task Details
- ID: tm-abc
- Priority: 2
- Size: medium
- Type: task

## Previous Interaction

**You previously asked:**
What is the API endpoint for authentication?

**Context you provided:**
The documentation does not specify this

**Human's response:**
https://api.example.com/auth

*(Response received at: 2/5/2026, 2:30:00 PM)*

Please continue working on the task using the information provided above.

## Instructions
Please complete this task using your available tools. 

**Progress Updates**: As you work, please update your progress status periodically using the CLI: `bh update tm-abc --status "Currently doing..."`. This helps the user know what you are focusing on.

When finished, provide a JSON response with your results.
```

## Key Changes

1. **New "Previous Interaction" section** - Only appears when both `task.question` and `task.humanResponse` are present
2. **Includes original question** - Reminds the agent what they asked
3. **Includes context** - Shows any additional context the agent provided (optional)
4. **Shows human response** - The actual answer from the user
5. **Timestamp** - When the response was received (optional, helps with context)
6. **Clear instruction** - Tells agent to continue with the provided information

This ensures the agent has full context when resuming from an awaiting_input state, making the conversation flow naturally.
