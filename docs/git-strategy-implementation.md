# Git Strategy Configuration - Implementation Summary

## Overview

Added configurable git workflow strategies to beehive worker, allowing teams to choose between direct commits, feature branches, or GitHub pull requests.

## Configuration

### Config Structure

Added `git` configuration section to `.bh/config.json`:

```json5
{
  "git": {
    "strategy": "direct",  // direct | branch | pr (default: direct)
    "baseBranch": "main"   // Base branch for merge operations (default: main)
  }
}
```

### Strategies

**`direct`** (default): Traditional workflow
- Commits directly to current branch
- No branch management
- Suitable for solo development

**`branch`**: Feature branch workflow
- Creates `task/<id>` branch before execution
- Commits to task branch
- On success: merges to base branch (no-ff) and deletes task branch
- On failure: preserves task branch, switches back to base branch
- Suitable for local code review workflows

**`pr`**: Pull request workflow
- Creates `task/<id>` branch before execution
- Pushes branch to remote
- Creates GitHub pull request
- Requires GitHub configuration
- Suitable for team collaboration

## Implementation Details

### Files Modified

1. **src/config.ts**
   - Added `GitStrategy` type: `'direct' | 'branch' | 'pr'`
   - Added `GitConfig` interface with `strategy` and `baseBranch`
   - Added `ProjectConfig.git` field
   - Added `ConfigManager.gitStrategy` getter (default: 'direct')
   - Added `ConfigManager.gitBaseBranch` getter (fallback: github.baseBranch → 'main')

2. **src/commands/worker.ts**
   - **Branch creation**: Added logic in `processTask()` after file snapshot capture
     - Creates `task/<id>` branch when strategy is 'branch'
     - Handles existing branch gracefully
   - **New method**: `syncGitWithBranch()` implements branch mode workflow:
     - Commits to task branch
     - Switches to base branch
     - Merges with `--no-ff` flag
     - Deletes task branch on success
     - Pushes to remote if configured
   - **Updated method**: `syncGit()` routes to correct strategy:
     - 'pr' → `syncGitWithPR()` (existing)
     - 'branch' → `syncGitWithBranch()` (new)
     - 'direct' → `syncGitDirect()` (existing)
   - **Failure handling**: Added branch cleanup on task failure
     - Preserves task branch for review
     - Switches back to base branch
     - Provides helpful message

3. **src/tests/config.test.ts**
   - Added tests for default git strategy values
   - Added tests for loading git config from file
   - Added tests for all strategy values (direct, branch, pr)
   - Added test for baseBranch fallback to github.baseBranch

4. **README.md**
   - Added git configuration section to config example
   - Added comprehensive git strategy documentation
   - Added workflow examples for each strategy
   - Added use cases and best practices

5. **CLAUDE.md**
   - Added git configuration to developer config reference
   - Added git workflow strategies section with implementation details
   - Documented method locations and behavior

## Workflow Examples

### Branch Strategy Flow

**On task start:**
```bash
git checkout -b task/tm-abc
# Agent makes changes...
```

**On success:**
```bash
git add -A
git commit -m "tm-abc: Implemented feature"
git checkout main
git merge --no-ff task/tm-abc -m "Merge task/tm-abc: Implemented feature"
git branch -d task/tm-abc
git push origin main
```

**On failure:**
```bash
# Branch preserved at task/tm-abc
git checkout main
# User can later: git checkout task/tm-abc to review/fix
```

## Testing

All tests pass (192 tests):
- ✅ Default git strategy is 'direct'
- ✅ Config loads custom git strategy
- ✅ All strategy values work (direct, branch, pr)
- ✅ baseBranch fallback to github.baseBranch
- ✅ TypeScript compilation successful
- ✅ Types exported correctly

## Backwards Compatibility

- **Default behavior unchanged**: Existing projects continue using 'direct' strategy
- **Fallback handling**: `git.baseBranch` falls back to `github.baseBranch` for compatibility
- **No breaking changes**: All existing config fields work as before

## Usage Example

```json5
// .bh/config.json
{
  "workflow": "coding",
  "git": {
    "strategy": "branch",
    "baseBranch": "develop"
  }
}
```

When worker processes a task:
1. Creates branch `task/tm-xyz`
2. Agent makes changes
3. Commits to `task/tm-xyz`
4. Merges to `develop`
5. Deletes `task/tm-xyz`
6. Pushes `develop`

If task fails, branch `task/tm-xyz` is preserved for review.
