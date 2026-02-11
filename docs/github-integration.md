# GitHub PR Integration

This document describes the GitHub PR integration features in beehive, including the GitHubClient utility for programmatic PR management.

## Overview

The GitHub integration allows beehive to create, update, and manage pull requests directly from task workflows. This enables automated PR creation when tasks are completed and maintains a connection between tasks and their associated PRs.

## Configuration

Enable GitHub integration in your project's `.bh/config.json`:

```json5
{
  github: {
    enabled: true,
    repo: "owner/repo-name",
    baseBranch: "main"
  }
}
```

**Configuration options:**
- `enabled` (boolean): Enable GitHub PR integration (default: `false`)
- `repo` (string): GitHub repository in format `owner/repo-name`
- `baseBranch` (string): Base branch for PRs (default: `"main"`)

## Authentication

The GitHubClient requires a GitHub personal access token for authentication. Set the `GITHUB_TOKEN` environment variable:

```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

**Required token permissions:**
- `repo` (full control of private repositories)
- `pull_requests` (read/write access to PRs)

## GitHubClient API

The `GitHubClient` class provides a high-level interface for GitHub operations.

### Basic Usage

```typescript
import { GitHubClient } from './utils/github.js';

// Initialize client
const client = new GitHubClient('owner/repo', process.env.GITHUB_TOKEN);

// Create a PR
const pr = await client.createPR({
  title: 'feat: Add new feature',
  body: 'Description of changes',
  head: 'feature-branch',
  base: 'main',
  draft: false
});

console.log(`Created PR #${pr.number}: ${pr.url}`);
```

### Methods

#### Pull Request Operations

**Create PR**
```typescript
async createPR(options: GitHubPROptions): Promise<GitHubPR>
```

Creates a new pull request.

**Options:**
- `title` (string): PR title
- `body` (string): PR description
- `head` (string): Source branch name
- `base` (string): Target branch name
- `draft` (boolean, optional): Create as draft PR (default: `false`)

**Get PR**
```typescript
async getPR(prNumber: number): Promise<GitHubPR>
```

Retrieves pull request information by number.

**Update PR**
```typescript
async updatePR(prNumber: number, options: Partial<{
  title: string;
  body: string;
}>): Promise<GitHubPR>
```

Updates an existing pull request's title or body.

**Close PR**
```typescript
async closePR(prNumber: number): Promise<GitHubPR>
```

Closes a pull request without merging.

**Merge PR**
```typescript
async mergePR(prNumber: number, options?: {
  commitTitle?: string;
  commitMessage?: string;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
}): Promise<{ sha: string; merged: boolean; message: string }>
```

Merges a pull request.

**List PRs**
```typescript
async listPRs(options?: {
  state?: 'open' | 'closed' | 'all';
  head?: string;
  base?: string;
}): Promise<GitHubPR[]>
```

Lists pull requests with optional filters.

**Find PR by Branch**
```typescript
async findPRByBranch(branchName: string, baseBranch?: string): Promise<GitHubPR | null>
```

Finds an open PR for a specific branch.

#### Branch Operations

**Check Branch Exists**
```typescript
async branchExists(branchName: string): Promise<boolean>
```

Checks if a branch exists in the repository.

**Get Branch**
```typescript
async getBranch(branchName: string): Promise<GitHubBranch>
```

Retrieves branch information.

**Create Branch**
```typescript
async createBranch(branchName: string, baseBranch: string): Promise<{
  ref: string;
  sha: string;
}>
```

Creates a new branch from a base branch.

**Delete Branch**
```typescript
async deleteBranch(branchName: string): Promise<void>
```

Deletes a branch from the repository.

**Get Default Branch**
```typescript
async getDefaultBranch(): Promise<string>
```

Retrieves the repository's default branch name.

### Type Definitions

**GitHubPR**
```typescript
interface GitHubPR {
  number: number;
  url: string;
  state: 'open' | 'closed';
  merged: boolean;
  mergeable: boolean | null;
  head: {
    ref: string;  // branch name
    sha: string;  // commit SHA
  };
  base: {
    ref: string;  // target branch
  };
}
```

**GitHubBranch**
```typescript
interface GitHubBranch {
  name: string;
  sha: string;
  protected: boolean;
}
```

## Usage Examples

### Creating a PR from a Task

```typescript
import { GitHubClient } from './utils/github.js';
import { ConfigManager } from './config.js';

const config = new ConfigManager();
await config.loadConfig();

if (config.githubEnabled && config.githubRepo) {
  const client = new GitHubClient(config.githubRepo);
  
  // Create branch for task
  const branchName = `task/${task.id}`;
  await client.createBranch(branchName, config.githubBaseBranch);
  
  // Create PR
  const pr = await client.createPR({
    title: task.title,
    body: `Closes task: ${task.id}\n\n${task.description || ''}`,
    head: branchName,
    base: config.githubBaseBranch
  });
  
  // Update task with PR info
  await manager.updateTask(task.id, {
    prNumber: pr.number,
    prUrl: pr.url,
    prBranch: branchName
  });
}
```

### Checking PR Status

```typescript
const client = new GitHubClient('owner/repo');

// Get PR information
const pr = await client.getPR(123);

console.log(`PR #${pr.number} is ${pr.state}`);
console.log(`Mergeable: ${pr.mergeable}`);
console.log(`Merged: ${pr.merged}`);

if (pr.state === 'open' && pr.mergeable) {
  console.log('PR is ready to merge!');
}
```

### Automatic PR Merge on Task Completion

```typescript
// When a task is closed, check if it has an associated PR
if (task.prNumber) {
  const client = new GitHubClient(config.githubRepo);
  const pr = await client.getPR(task.prNumber);
  
  if (pr.state === 'open' && pr.mergeable) {
    await client.mergePR(pr.number, {
      commitTitle: `Merge: ${task.title}`,
      mergeMethod: 'squash'
    });
    
    // Optionally delete the feature branch
    await client.deleteBranch(pr.head.ref);
  }
}
```

### Branch Management

```typescript
const client = new GitHubClient('owner/repo');

// Check if branch exists before creating
const branchName = 'feature/new-feature';
const exists = await client.branchExists(branchName);

if (!exists) {
  await client.createBranch(branchName, 'main');
  console.log(`Created branch: ${branchName}`);
} else {
  console.log(`Branch ${branchName} already exists`);
}

// Get branch info
const branch = await client.getBranch(branchName);
console.log(`Branch SHA: ${branch.sha}`);
console.log(`Protected: ${branch.protected}`);
```

### Finding Existing PRs

```typescript
const client = new GitHubClient('owner/repo');

// Find PR for a specific branch
const pr = await client.findPRByBranch('feature-branch', 'main');

if (pr) {
  console.log(`Found existing PR #${pr.number}: ${pr.url}`);
} else {
  console.log('No PR found for this branch');
}

// List all open PRs
const openPRs = await client.listPRs({ state: 'open' });
console.log(`${openPRs.length} open PRs`);
```

## Error Handling

The GitHubClient throws descriptive errors for all operations:

```typescript
try {
  await client.createPR({ /* options */ });
} catch (error) {
  if (error.message.includes('GitHub token not provided')) {
    console.error('Set GITHUB_TOKEN environment variable');
  } else if (error.message.includes('Failed to create PR')) {
    console.error('PR creation failed:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Best Practices

1. **Token Security**: Never commit your GitHub token. Use environment variables or secure secret management.

2. **Branch Naming**: Use consistent branch naming conventions (e.g., `task/tm-abc`, `feature/login`).

3. **PR Templates**: Consider using GitHub PR templates for consistent PR descriptions.

4. **Merge Strategy**: Choose an appropriate merge method:
   - `merge`: Preserves full commit history
   - `squash`: Combines commits into one (cleaner history)
   - `rebase`: Replays commits on top of base branch

5. **Branch Cleanup**: Delete feature branches after merging to keep the repository clean.

6. **Rate Limiting**: GitHub API has rate limits. The client will throw errors if limits are exceeded.

## Integration with Worker

The GitHubClient is integrated with the worker's git sync workflow. When GitHub integration is enabled in `.bh/config.json`, the worker automatically creates branches and PRs for completed tasks.

### Worker PR Workflow

When a task is completed and `config.github.enabled` is `true`:

1. **Branch Creation**: Worker creates a new branch named `task/{task-id}` (e.g., `task/tm-abc`)
2. **Commit**: Changes are committed to the task branch
3. **Push**: Branch is pushed to the remote repository
4. **PR Creation**: A pull request is created from the task branch to the base branch
5. **Task Update**: Task metadata is updated with PR information (`prNumber`, `prUrl`, `prBranch`)
6. **Restore**: Worker returns to the original branch

**Workflow Diagram:**

```
Complete Task
     ↓
Check GitHub Config
     ↓
[Enabled]          [Disabled]
     ↓                  ↓
Create Branch      Direct Commit
task/tm-abc        to Current Branch
     ↓                  ↓
Commit & Push      Push to Remote
     ↓
Create PR
     ↓
Update Task
(prNumber, prUrl, prBranch)
     ↓
Return to Original Branch
```

### Configuration Example

```json5
{
  github: {
    enabled: true,
    repo: "owner/repo-name",
    baseBranch: "main"
  },
  workflow: "coding"
}
```

### PR Details

The worker creates PRs with the following format:

**Title:** `{task-id}: {task-title}`

**Body:**
```
Closes task: {task-id}

{task-description}

## Summary

{completion-summary}

## Details

{completion-details}
```

### Handling Existing PRs

If a PR already exists for the task branch, the worker reuses it instead of creating a duplicate. This allows tasks to be updated with additional commits without creating multiple PRs.

### Error Handling

The worker handles various error scenarios gracefully:

- **No GitHub Token**: Logs warning, pushes branch but doesn't create PR
- **PR Creation Fails**: Logs error, branch remains pushed for manual PR creation
- **No Remote**: Logs warning, skips push and PR creation
- **Branch Exists**: Checks out existing branch and commits to it

### Future Enhancements

Planned features for worker integration:

1. Automatic merging when tasks are completed and reviewed
2. CI/CD integration (wait for checks to pass before merging)
3. Automatic branch cleanup after PR merge

## PR Sync Command

The `bh pr sync` command synchronizes task states with their associated GitHub pull request status. This enables automatic task management based on PR state changes.

### Usage

```bash
# Sync all tasks with PRs
bh pr sync

# Dry run (show what would be updated without making changes)
bh pr sync --dry-run
```

### Behavior

The sync command:

1. **Loads all tasks** with `prNumber` set
2. **Fetches PR status** from GitHub for each task
3. **Updates task state** based on PR state:
   - **PR merged** → Task set to `closed`
   - **PR closed without merge** → Task set to `failed`
   - **PR still open** → No change

### Examples

**Basic sync:**
```bash
$ bh pr sync
🔍 Found 3 task(s) with associated PRs...

✅ tm-abc - close task (PR #42 was merged)
✅ tm-def - fail task (PR #43 was closed without merge)
ℹ️  tm-ghi - no change (PR #44 is still open)

📊 Sync complete: 2 task(s) updated, 1 unchanged, 0 error(s)
```

**Dry run:**
```bash
$ bh pr sync --dry-run
🔍 Found 3 task(s) with associated PRs...
🏃 Dry run mode - no changes will be made

✅ tm-abc - close task (PR #42 was merged)
✅ tm-def - fail task (PR #43 was closed without merge)
ℹ️  tm-ghi - no change (PR #44 is still open)

📊 Dry run complete: 2 task(s) would be updated
```

### Use Cases

**Automated CI/CD Pipeline:**
```bash
# Run sync after GitHub webhook or on schedule
*/5 * * * * cd /path/to/project && bh pr sync
```

**Manual Synchronization:**
```bash
# After reviewing and merging PRs manually
bh pr sync
```

**Verification Before Sync:**
```bash
# Check what would happen without making changes
bh pr sync --dry-run
```

### Requirements

The sync command requires:

1. **GitHub integration enabled** in `.bh/config.json`:
   ```json5
   {
     github: {
       enabled: true,
       repo: "owner/repo-name"
     }
   }
   ```

2. **GitHub token** set in environment:
   ```bash
   export GITHUB_TOKEN="ghp_your_token_here"
   ```

3. **Tasks with PR metadata**: Tasks must have `prNumber` set (automatically set by worker when creating PRs)

### Error Handling

The sync command handles errors gracefully:

- **GitHub integration disabled**: Shows configuration instructions and exits
- **No GitHub token**: Shows setup instructions and exits
- **PR fetch fails**: Logs error for that task and continues with others
- **No tasks with PRs**: Displays informational message

### Task State Transitions

| PR State | PR Merged | Task Action |
|----------|-----------|-------------|
| `closed` | `true` | Set to `closed` with merge details |
| `closed` | `false` | Set to `failed` |
| `open` | N/A | No change |

### Completion Details

When a task is closed via PR sync, the completion details include:

- **Summary**: `Automatically closed: PR #{number} was merged`
- **Details**: `PR {url} was successfully merged into {base-branch}`

### Best Practices

1. **Regular Syncing**: Run `bh pr sync` regularly (e.g., via cron) to keep task states up-to-date
2. **Dry Run First**: Use `--dry-run` to preview changes before applying them
3. **Monitor Failures**: Review tasks that fail (PR closed without merge) to understand why PRs weren't merged
4. **Webhook Integration**: Consider GitHub webhooks to trigger sync on PR state changes

### Integration with Worker

The PR sync command complements the worker's PR creation workflow:

1. **Worker creates PR** when task completes → Task metadata includes `prNumber`, `prUrl`, `prBranch`
2. **PR is reviewed and merged** (or closed) on GitHub
3. **`bh pr sync` updates task state** based on PR outcome

This creates a complete lifecycle:

```
Task → Worker → PR Creation → Review → Merge/Close → Sync → Task Closed/Failed
```

## Troubleshooting

**"GitHub token not provided"**
- Set the `GITHUB_TOKEN` environment variable
- Ensure the token has the correct permissions

**"Invalid repository format"**
- Repository must be in format `owner/repo-name`
- Check `.bh/config.json` for correct `github.repo` value

**"Failed to create branch"**
- Branch may already exist
- Check if base branch exists
- Verify token has write permissions

**"Failed to create PR"**
- Check if a PR already exists for the branch
- Verify head and base branches exist
- Ensure PR title and body are provided

## Future Enhancements

Planned features for GitHub integration:

1. Automatic PR creation on task state transitions
2. PR status syncing back to task state
3. CI/CD integration (wait for checks to pass)
4. GitHub Actions workflow triggers
5. Automatic PR reviews and approvals
6. Labels and assignees management
7. Milestone tracking
