import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import * as lockfile from 'proper-lockfile';
import { 
  Task, TaskStore, TaskState, CreateTaskInput, UpdateTaskInput, Submission, 
  Project, ApiKey 
} from '../types.js';
import { generateId } from '../id-generator.js';
import { generateKey, hashKey } from '../auth.js';

interface HiveData {
  projects: Record<string, Project>;
  tasks: Record<string, Task>;
  submissions: Record<string, Submission>;
  apiKeys: ApiKey[];
  logs: Record<string, string[]>;
}

export class LocalTaskStore implements TaskStore {
  private filePath: string;
  private readonly lockOptions = {
    retries: {
      retries: 10,
      minTimeout: 100,
      maxTimeout: 2000,
    },
    stale: 10000,
  };

  constructor(filePath: string = './.bh/hive.json') {
    this.filePath = filePath;
  }

  private async withLock<T>(fn: (data: HiveData) => Promise<T>): Promise<T> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    if (!existsSync(this.filePath)) {
      await writeFile(this.filePath, JSON.stringify({
        projects: {},
        tasks: {},
        submissions: {},
        apiKeys: [],
        logs: {}
      }), 'utf-8');
    }

    const release = await lockfile.lock(this.filePath, this.lockOptions);
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content) as HiveData;
      
      const result = await fn(data);
      
      await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
      return result;
    } finally {
      await release();
    }
  }

  async listTasks(project: string, filters?: { state?: TaskState; role?: string }): Promise<Task[]> {
    return this.withLock(async (data) => {
      let tasks = Object.values(data.tasks).filter(t => t.project === project);
      if (filters?.state) tasks = tasks.filter(t => t.state === filters.state);
      if (filters?.role) tasks = tasks.filter(t => t.role === filters.role);
      return tasks;
    });
  }

  async getTask(project: string, id: string): Promise<Task | null> {
    return this.withLock(async (data) => {
      const task = data.tasks[id];
      if (!task || task.project !== project) return null;
      return task;
    });
  }

  async createTask(project: string, input: CreateTaskInput): Promise<Task> {
    return this.withLock(async (data) => {
      const existingIds = new Set(Object.keys(data.tasks));
      const id = generateId(existingIds, project);
      
      const task: Task = {
        id,
        project,
        description: input.description,
        state: TaskState.OPEN,
        role: input.role,
        priority: input.priority,
        dependencies: input.dependencies || [],
        testCommand: input.testCommand,
        parentTask: input.parentTask,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      data.tasks[id] = task;
      return task;
    });
  }

  async claimTask(project: string, id: string, bee?: string): Promise<Task | 'not_found' | 'conflict'> {
    return this.withLock(async (data) => {
      const task = data.tasks[id];
      if (!task || task.project !== project) return 'not_found';
      if (task.state !== TaskState.OPEN) return 'conflict';
      
      task.state = TaskState.IN_PROGRESS;
      task.claimedBy = bee;
      task.updatedAt = new Date().toISOString();
      
      return task;
    });
  }

  async submitTask(project: string, id: string, submission: Submission): Promise<Task | 'not_found'> {
    return this.withLock(async (data) => {
      const task = data.tasks[id];
      if (!task || task.project !== project) return 'not_found';
      
      task.state = TaskState.PENDING_REVIEW;
      task.updatedAt = new Date().toISOString();
      data.submissions[id] = submission;
      
      // Auto-create a review task
      const existingIds = new Set(Object.keys(data.tasks));
      const reviewTaskId = generateId(existingIds, project);
      const reviewTask: Task = {
        id: reviewTaskId,
        project,
        description: `Review: ${task.description} (${id})`,
        role: 'pr_review',
        state: TaskState.OPEN,
        priority: task.priority,
        dependencies: [],
        prUrl: submission.pr_url,
        reviewsTask: id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.tasks[reviewTaskId] = reviewTask;
      
      return task;
    });
  }

  async approveTask(project: string, id: string): Promise<Task | 'not_found'> {
    return this.withLock(async (data) => {
      const task = data.tasks[id];
      if (!task || task.project !== project) return 'not_found';
      
      const submission = data.submissions[id];
      if (!submission) return task;

      task.state = TaskState.CLOSED;
      task.summary = submission.summary;
      task.details = submission.details;
      task.prUrl = submission.pr_url;
      task.updatedAt = new Date().toISOString();

      if (submission.follow_up_tasks) {
        for (const input of submission.follow_up_tasks) {
          const existingIds = new Set(Object.keys(data.tasks));
          const followId = generateId(existingIds, project);
          data.tasks[followId] = {
            id: followId,
            project,
            description: input.description,
            role: input.role,
            priority: input.priority,
            state: TaskState.OPEN,
            dependencies: input.dependencies || [],
            parentTask: id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
      }

      delete data.submissions[id];

      const reviewTask = Object.values(data.tasks).find(t => t.reviewsTask === id && t.state !== TaskState.CLOSED);
      if (reviewTask) {
        reviewTask.state = TaskState.CLOSED;
        reviewTask.updatedAt = new Date().toISOString();
      }

      return task;
    });
  }

  async rejectTask(project: string, id: string, reason: string): Promise<Task | 'not_found'> {
    return this.withLock(async (data) => {
      const task = data.tasks[id];
      if (!task || task.project !== project) return 'not_found';
      
      task.state = TaskState.OPEN;
      task.updatedAt = new Date().toISOString();
      delete data.submissions[id];

      const reviewTask = Object.values(data.tasks).find(t => t.reviewsTask === id && t.state !== TaskState.CLOSED);
      if (reviewTask) {
        reviewTask.state = TaskState.CLOSED;
        reviewTask.summary = `Rejected: ${reason}`;
        reviewTask.updatedAt = new Date().toISOString();
      }

      return task;
    });
  }

  async failTask(project: string, id: string, error: string, details?: string): Promise<Task | 'not_found'> {
    return this.withLock(async (data) => {
      const task = data.tasks[id];
      if (!task || task.project !== project) return 'not_found';
      
      task.state = TaskState.FAILED;
      task.summary = error;
      task.details = details;
      task.updatedAt = new Date().toISOString();
      
      return task;
    });
  }

  async reopenTask(project: string, id: string): Promise<Task | 'not_found'> {
    return this.withLock(async (data) => {
      const task = data.tasks[id];
      if (!task || task.project !== project) return 'not_found';
      
      task.state = TaskState.OPEN;
      task.updatedAt = new Date().toISOString();
      
      return task;
    });
  }

  async updateTask(project: string, id: string, input: UpdateTaskInput): Promise<Task | 'not_found'> {
    return this.withLock(async (data) => {
      const task = data.tasks[id];
      if (!task || task.project !== project) return 'not_found';
      
      if (input.description !== undefined) task.description = input.description;
      if (input.role !== undefined) task.role = input.role;
      if (input.priority !== undefined) task.priority = input.priority;
      if (input.state !== undefined) task.state = input.state;
      if (input.status !== undefined) task.status = input.status;
      if (input.testCommand !== undefined) task.testCommand = input.testCommand;
      if (input.sessionId !== undefined) task.sessionId = input.sessionId;
      if (input.prUrl !== undefined) task.prUrl = input.prUrl;
      
      task.updatedAt = new Date().toISOString();
      return task;
    });
  }

  async getTaskLog(project: string, id: string): Promise<string[] | 'not_found'> {
    return this.withLock(async (data) => {
      const task = data.tasks[id];
      if (!task || task.project !== project) return 'not_found';
      return data.logs[id] || [];
    });
  }

  async claimNextTask(project: string, criteria: { bee?: string; roles?: string[] }): Promise<Task | null> {
    return this.withLock(async (data) => {
      const tasks = Object.values(data.tasks)
        .filter(t => t.project === project && t.state === TaskState.OPEN);
      
      const filtered = criteria.roles && criteria.roles.length > 0
        ? tasks.filter(t => t.role && criteria.roles!.includes(t.role))
        : tasks;

      // Sort by priority (0 highest), then by createdAt
      const sorted = filtered.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      for (const task of sorted) {
        // Check dependencies
        const allDepsClosed = task.dependencies.every(depId => {
          const dep = data.tasks[depId];
          return dep && dep.state === TaskState.CLOSED;
        });

        if (allDepsClosed) {
          task.state = TaskState.IN_PROGRESS;
          task.claimedBy = criteria.bee;
          task.updatedAt = new Date().toISOString();
          return task;
        }
      }

      return null;
    });
  }

  async createProject(project: Partial<Project> & { name: string }): Promise<{ project: Project; adminKey: string }> {
    return this.withLock(async (data) => {
      const newProject: Project = {
        name: project.name,
        repo: project.repo || '',
        config: project.config || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.projects[project.name] = newProject;

      const adminKey = generateKey('admin');
      const apiKey: ApiKey = {
        keyHash: hashKey(adminKey),
        project: project.name,
        role: 'admin',
        label: 'bootstrap',
        createdAt: new Date().toISOString(),
      };
      data.apiKeys.push(apiKey);

      return { project: newProject, adminKey };
    });
  }

  async getProject(name: string): Promise<Project | null> {
    return this.withLock(async (data) => {
      return data.projects[name] || null;
    });
  }

  async createKey(project: string, role: 'admin' | 'bee', label?: string): Promise<{ key: string; apiKey: ApiKey }> {
    return this.withLock(async (data) => {
      const key = generateKey(role);
      const apiKey: ApiKey = {
        keyHash: hashKey(key),
        project,
        role,
        label,
        createdAt: new Date().toISOString(),
      };
      data.apiKeys.push(apiKey);
      return { key, apiKey };
    });
  }

  async listKeys(project: string): Promise<ApiKey[]> {
    return this.withLock(async (data) => {
      return data.apiKeys.filter(k => k.project === project);
    });
  }

  async revokeKey(project: string, keyHash: string): Promise<boolean> {
    return this.withLock(async (data) => {
      const index = data.apiKeys.findIndex(k => k.project === project && k.keyHash === keyHash);
      if (index === -1) return false;
      data.apiKeys.splice(index, 1);
      return true;
    });
  }

  async getApiKey(keyHash: string): Promise<ApiKey | null> {
    return this.withLock(async (data) => {
      const apiKey = data.apiKeys.find(k => k.keyHash === keyHash);
      if (!apiKey) return null;
      
      apiKey.lastUsedAt = new Date().toISOString();
      return apiKey;
    });
  }

  async listProjects(): Promise<string[]> {
    return this.withLock(async (data) => {
      return Object.keys(data.projects);
    });
  }
}
