import { Octokit } from 'octokit';
import { execSync } from 'child_process';

function getGitHubToken(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync('gh auth token', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    throw new Error('No GitHub token found. Set GITHUB_TOKEN or run `gh auth login`.');
  }
}

export interface GitHubPROptions {
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
}

export interface GitHubPR {
  number: number;
  url: string;
  state: 'open' | 'closed';
  merged: boolean;
  mergeable: boolean | null;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
}

export interface GitHubBranch {
  name: string;
  sha: string;
  protected: boolean;
}

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(repoFullName: string, token?: string) {
    const authToken = getGitHubToken(token);

    this.octokit = new Octokit({ auth: authToken });

    // Parse repo format: "owner/repo"
    const parts = repoFullName.split('/');
    if (parts.length !== 2) {
      throw new Error(`Invalid repository format: ${repoFullName}. Expected "owner/repo".`);
    }
    this.owner = parts[0];
    this.repo = parts[1];
  }

  /**
   * Create a new pull request
   */
  async createPR(options: GitHubPROptions): Promise<GitHubPR> {
    try {
      const response = await this.octokit.rest.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base,
        draft: options.draft ?? false,
      });

      return this.formatPR(response.data);
    } catch (error) {
      throw new Error(`Failed to create PR: ${(error as Error).message}`);
    }
  }

  /**
   * Get pull request by number
   */
  async getPR(prNumber: number): Promise<GitHubPR> {
    try {
      const response = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
      });

      return this.formatPR(response.data);
    } catch (error) {
      throw new Error(`Failed to get PR #${prNumber}: ${(error as Error).message}`);
    }
  }

  /**
   * Update an existing pull request
   */
  async updatePR(
    prNumber: number,
    options: Partial<Omit<GitHubPROptions, 'head' | 'base'>>
  ): Promise<GitHubPR> {
    try {
      const response = await this.octokit.rest.pulls.update({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        title: options.title,
        body: options.body,
      });

      return this.formatPR(response.data);
    } catch (error) {
      throw new Error(`Failed to update PR #${prNumber}: ${(error as Error).message}`);
    }
  }

  /**
   * Close a pull request
   */
  async closePR(prNumber: number): Promise<GitHubPR> {
    try {
      const response = await this.octokit.rest.pulls.update({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        state: 'closed',
      });

      return this.formatPR(response.data);
    } catch (error) {
      throw new Error(`Failed to close PR #${prNumber}: ${(error as Error).message}`);
    }
  }

  /**
   * Merge a pull request
   */
  async mergePR(
    prNumber: number,
    options?: {
      commitTitle?: string;
      commitMessage?: string;
      mergeMethod?: 'merge' | 'squash' | 'rebase';
    }
  ): Promise<{ sha: string; merged: boolean; message: string }> {
    try {
      const response = await this.octokit.rest.pulls.merge({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        commit_title: options?.commitTitle,
        commit_message: options?.commitMessage,
        merge_method: options?.mergeMethod || 'merge',
      });

      return {
        sha: response.data.sha,
        merged: response.data.merged,
        message: response.data.message,
      };
    } catch (error) {
      throw new Error(`Failed to merge PR #${prNumber}: ${(error as Error).message}`);
    }
  }

  /**
   * Check if a branch exists
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.octokit.rest.repos.getBranch({
        owner: this.owner,
        repo: this.repo,
        branch: branchName,
      });
      return true;
    } catch (error) {
      const err = error as { status?: number };
      if (err.status === 404) {
        return false;
      }
      throw new Error(`Failed to check branch ${branchName}: ${(error as Error).message}`);
    }
  }

  /**
   * Get branch information
   */
  async getBranch(branchName: string): Promise<GitHubBranch> {
    try {
      const response = await this.octokit.rest.repos.getBranch({
        owner: this.owner,
        repo: this.repo,
        branch: branchName,
      });

      return {
        name: response.data.name,
        sha: response.data.commit.sha,
        protected: response.data.protected,
      };
    } catch (error) {
      throw new Error(`Failed to get branch ${branchName}: ${(error as Error).message}`);
    }
  }

  /**
   * Create a new branch from a base branch
   */
  async createBranch(branchName: string, baseBranch: string): Promise<{ ref: string; sha: string }> {
    try {
      // Get the SHA of the base branch
      const baseRef = await this.octokit.rest.repos.getBranch({
        owner: this.owner,
        repo: this.repo,
        branch: baseBranch,
      });

      // Create the new branch
      const response = await this.octokit.rest.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branchName}`,
        sha: baseRef.data.commit.sha,
      });

      return {
        ref: response.data.ref,
        sha: response.data.object.sha,
      };
    } catch (error) {
      throw new Error(`Failed to create branch ${branchName}: ${(error as Error).message}`);
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchName: string): Promise<void> {
    try {
      await this.octokit.rest.git.deleteRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branchName}`,
      });
    } catch (error) {
      throw new Error(`Failed to delete branch ${branchName}: ${(error as Error).message}`);
    }
  }

  /**
   * List pull requests with optional filters
   */
  async listPRs(options?: {
    state?: 'open' | 'closed' | 'all';
    head?: string;
    base?: string;
  }): Promise<GitHubPR[]> {
    try {
      const response = await this.octokit.rest.pulls.list({
        owner: this.owner,
        repo: this.repo,
        state: options?.state || 'open',
        head: options?.head ? `${this.owner}:${options.head}` : undefined,
        base: options?.base,
      });

      return response.data.map((pr: any) => this.formatPR(pr));
    } catch (error) {
      throw new Error(`Failed to list PRs: ${(error as Error).message}`);
    }
  }

  /**
   * Check if a PR exists for a specific branch
   */
  async findPRByBranch(branchName: string, baseBranch?: string): Promise<GitHubPR | null> {
    try {
      const prs = await this.listPRs({
        state: 'open',
        head: branchName,
        base: baseBranch,
      });

      return prs.length > 0 ? prs[0] : null;
    } catch (error) {
      throw new Error(`Failed to find PR for branch ${branchName}: ${(error as Error).message}`);
    }
  }

  /**
   * Get the default branch of the repository
   */
  async getDefaultBranch(): Promise<string> {
    try {
      const response = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo,
      });

      return response.data.default_branch;
    } catch (error) {
      throw new Error(`Failed to get default branch: ${(error as Error).message}`);
    }
  }

  /**
   * Format PR data from Octokit response to our interface
   */
  private formatPR(pr: {
    number: number;
    html_url: string;
    state: string;
    merged?: boolean;
    mergeable?: boolean | null | undefined;
    head: { ref: string; sha: string };
    base: { ref: string };
    [key: string]: unknown;
  }): GitHubPR {
    return {
      number: pr.number,
      url: pr.html_url,
      state: pr.state as 'open' | 'closed',
      merged: pr.merged || false,
      mergeable: pr.mergeable === undefined ? null : pr.mergeable,
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
      },
      base: {
        ref: pr.base.ref,
      },
    };
  }
}
