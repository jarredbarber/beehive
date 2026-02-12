import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
}

/**
 * Get current git status
 */
export async function getGitStatus(): Promise<GitStatus> {
  const { stdout } = await execAsync('git status --porcelain');
  
  const modified: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  
  stdout.split('\n').filter(Boolean).forEach(line => {
    const status = line.substring(0, 2);
    const file = line.substring(3);
    
    if (status.includes('M')) modified.push(file);
    if (status.includes('A') || status.includes('?')) added.push(file);
    if (status.includes('D')) deleted.push(file);
  });
  
  return { modified, added, deleted };
}

/**
 * Check if there are uncommitted changes
 */
export async function hasChanges(): Promise<boolean> {
  const status = await getGitStatus();
  return status.modified.length > 0 || status.added.length > 0 || status.deleted.length > 0;
}

export async function gitCommit(taskId: string, summary: string): Promise<void> {
  await execAsync('git add -A');
  await execAsync(`git commit -m "${taskId}: ${summary.replace(/"/g, '\\"')}"`);
}

export async function gitPush(taskId: string): Promise<void> {
  const branch = `task/${taskId}`;
  try {
    await execAsync(`git show-ref --verify refs/heads/${branch}`);
  } catch {
    await execAsync(`git checkout -b ${branch}`);
  }
  await execAsync(`git push -u origin ${branch}`);
}

export async function createPR(taskId: string, summary: string, details?: string): Promise<string> {
  const { stdout } = await execAsync(
    `gh pr create --title "${taskId}: ${summary.replace(/"/g, '\\"')}" --body "${(details || 'Automated').replace(/"/g, '\\"')}" --json url --jq .url`
  );
  return stdout.trim();
}

export async function findPR(taskId: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`gh pr list --head task/${taskId} --json url --jq '.[0].url'`);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function completeGitWorkflow(taskId: string, summary: string, details?: string): Promise<string> {
  await gitCommit(taskId, summary);
  await gitPush(taskId);
  let prUrl = await findPR(taskId);
  if (!prUrl) prUrl = await createPR(taskId, summary, details);
  return prUrl;
}
