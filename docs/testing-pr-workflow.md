# Testing GitHub PR Integration Workflow

This document describes how to test the GitHub PR integration in the Worker workflow.

## Prerequisites

1. **GitHub Repository**: A test repository with push access
2. **GitHub Token**: Set `GITHUB_TOKEN` environment variable with appropriate permissions:
   - `repo` (full control of private repositories)
   - `pull_requests` (read/write access to PRs)

## Configuration

Enable GitHub PR integration in `.bh/config.json`:

```json5
{
  github: {
    enabled: true,
    repo: "owner/repo-name",
    baseBranch: "main"
  }
}
```

## Test Scenarios

### Scenario 1: Basic PR Creation

**Setup:**
1. Create a test task:
   ```bash
   bh create -t "Test PR workflow" -r code -p 2 -d "Test the GitHub PR integration"
   ```

2. Make some code changes (e.g., create a test file):
   ```bash
   echo "// Test file" > test-pr.js
   ```

3. Run the worker:
   ```bash
   bh worker --once
   ```

**Expected Behavior:**
- Worker creates a new branch named `task/{task-id}`
- Commits changes to that branch
- Pushes the branch to remote
- Creates a PR from `task/{task-id}` to the base branch (e.g., `main`)
- Updates the task with PR information (`prNumber`, `prUrl`, `prBranch`)
- Returns to the original branch

**Verification:**
```bash
# Check task was updated with PR info
bh show {task-id}

# Verify PR was created on GitHub
# Check the prUrl field or visit GitHub directly
```

### Scenario 2: Existing PR

**Setup:**
1. Create a task and run it once (creating the initial PR)
2. Make additional changes to the codebase
3. Run the worker again on the same task

**Expected Behavior:**
- Worker checks out the existing branch (`task/{task-id}`)
- Commits new changes to the same branch
- Pushes the branch
- Finds the existing PR and reuses it (doesn't create a duplicate)
- Updates are visible in the existing PR

### Scenario 3: Detached HEAD State

**Setup:**
1. Put repository in detached HEAD state:
   ```bash
   git checkout HEAD~1
   ```

2. Create and run a task

**Expected Behavior:**
- Worker creates branch from the configured `baseBranch` (e.g., `main`)
- Workflow continues normally
- Returns to detached HEAD after completion (doesn't restore original branch)

### Scenario 4: No Remote Configured

**Setup:**
1. Create a test repository without a remote:
   ```bash
   mkdir test-repo && cd test-repo
   git init
   bh init
   ```

2. Configure GitHub integration but don't add a remote

**Expected Behavior:**
- Worker creates the branch and commits changes
- Push to remote fails gracefully
- Error message displayed: "Failed to push branch to remote"
- Original branch is restored

### Scenario 5: Disabled GitHub Integration

**Setup:**
1. Disable GitHub integration in config:
   ```json5
   {
     github: {
       enabled: false
     }
   }
   ```

2. Create and run a task

**Expected Behavior:**
- Worker uses traditional workflow (syncGitDirect)
- Commits directly to current branch
- Pushes current branch to remote
- No branch creation or PR

### Scenario 6: GitHub Token Not Set

**Setup:**
1. Unset the GitHub token:
   ```bash
   unset GITHUB_TOKEN
   ```

2. Enable GitHub integration and run a task

**Expected Behavior:**
- Worker attempts PR creation
- GitHubClient throws error: "GitHub token not provided"
- Error is caught and logged
- Worker continues (branch pushed but PR creation failed)

## Manual Verification Steps

After running a task with PR workflow:

1. **Check local git state:**
   ```bash
   git branch -a  # Should show task/{task-id} branch pushed to origin
   git log --oneline -5  # Should show commit on current branch
   ```

2. **Check task metadata:**
   ```bash
   bh show {task-id}
   # Should display:
   # - prNumber: 123
   # - prUrl: https://github.com/owner/repo/pull/123
   # - prBranch: task/{task-id}
   ```

3. **Check GitHub PR:**
   - Visit the PR URL
   - Verify PR title matches task title
   - Verify PR body includes task description and summary
   - Verify PR is targeting the correct base branch
   - Verify commits are present

4. **Check branch cleanup:**
   ```bash
   git branch  # Should be back on original branch
   ```

## Common Issues

### Issue: "Failed to create PR: Branch already exists"

**Cause:** The branch exists locally but wasn't pushed to remote, or there's a naming conflict.

**Solution:**
```bash
# Delete local branch and try again
git branch -D task/{task-id}
```

### Issue: "Failed to push branch to remote"

**Cause:** No remote configured, or authentication failed.

**Solution:**
```bash
# Add remote if missing
git remote add origin https://github.com/owner/repo.git

# Or verify authentication
git push origin main  # Test if you can push
```

### Issue: PR created but task not updated

**Cause:** Worker was interrupted after PR creation but before task update.

**Solution:**
```bash
# Manually update task with PR info
bh update {task-id} --pr-number 123 --pr-url "https://github.com/..." --pr-branch "task/{task-id}"
```

## Integration Test Checklist

- [ ] PR created successfully for new task
- [ ] Branch named correctly (`task/{task-id}`)
- [ ] PR title includes task ID and title
- [ ] PR body includes task description
- [ ] Task updated with prNumber, prUrl, prBranch
- [ ] Worker returns to original branch
- [ ] Existing PR reused when task re-run
- [ ] No duplicate PRs created
- [ ] Traditional workflow works when GitHub disabled
- [ ] Errors handled gracefully (no token, no remote, etc.)

## Automated Testing (Future)

Future enhancements should include:
1. Mock GitHubClient for unit tests
2. Integration tests with a test GitHub repository
3. CI/CD workflow to verify PR creation
4. Automated cleanup of test branches and PRs
