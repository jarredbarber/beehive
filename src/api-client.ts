import { 
  Task, 
  TaskState, 
  CreateTaskInput, 
  Submission 
} from './types.js';

export class BeehiveApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public responseBody: any
  ) {
    super(`Beehive API Error: ${status} ${statusText} - ${typeof responseBody === 'object' ? JSON.stringify(responseBody) : responseBody}`);
    this.name = 'BeehiveApiError';
  }
}

export class BeehiveApiClient {
  private baseUrl: string;
  private key: string;

  constructor() {
    const server = process.env.BH_SERVER;
    const key = process.env.BH_KEY;

    if (!server) {
      throw new Error('BH_SERVER environment variable is not set');
    }
    if (!key) {
      throw new Error('BH_KEY environment variable is not set');
    }

    this.baseUrl = server.endsWith('/') ? server.slice(0, -1) : server;
    this.key = key;
  }

  private async request<T>(
    method: string, 
    path: string, 
    body?: any, 
    params?: Record<string, string | undefined>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.append(key, value);
      });
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.key}`,
      'Content-Type': 'application/json'
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 204) {
      return null as any;
    }

    let responseData: any;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    if (!response.ok) {
      throw new BeehiveApiError(response.status, response.statusText, responseData);
    }

    return responseData as T;
  }

  // Task operations
  async listTasks(project: string, filters?: { state?: TaskState; role?: string }): Promise<Task[]> {
    return this.request<Task[]>('GET', '/tasks', undefined, {
      project,
      state: filters?.state,
      role: filters?.role
    });
  }

  async getTask(project: string, id: string): Promise<Task | null> {
    try {
      return await this.request<Task>('GET', `/tasks/${id}`, undefined, { project });
    } catch (error) {
      if (error instanceof BeehiveApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async createTask(project: string, task: CreateTaskInput): Promise<Task> {
    return this.request<Task>('POST', '/tasks', {
      project,
      ...task
    });
  }

  async claimTask(project: string, id: string, bee?: string): Promise<Task> {
    return this.request<Task>('POST', `/tasks/${id}/claim`, {
      project,
      bee
    });
  }

  async submitTask(project: string, id: string, submission: Submission): Promise<Task> {
    return this.request<Task>('POST', `/tasks/${id}/submit`, {
      project,
      ...submission
    });
  }

  async approveTask(project: string, id: string): Promise<Task> {
    return this.request<Task>('POST', `/tasks/${id}/approve`, {
      project
    });
  }

  async rejectTask(project: string, id: string, reason: string): Promise<Task> {
    return this.request<Task>('POST', `/tasks/${id}/reject`, {
      project,
      reason
    });
  }

  async failTask(project: string, id: string, error: string, details?: string): Promise<Task> {
    return this.request<Task>('POST', `/tasks/${id}/fail`, {
      project,
      error,
      details
    });
  }

  async updateTask(project: string, id: string, options: any): Promise<Task> {
    return this.request<Task>('PATCH', `/tasks/${id}`, {
      project,
      ...options
    });
  }

  async releaseTask(project: string, id: string): Promise<Task> {
    return this.request<Task>('POST', `/tasks/${id}/release`, {
      project
    });
  }

  async getTaskLog(project: string, id: string): Promise<string[]> {
    try {
      return await this.request<string[]>('GET', `/tasks/${id}/log`, undefined, { project });
    } catch (error) {
      if (error instanceof BeehiveApiError && error.status === 404) {
        return [];
      }
      throw error;
    }
  }

  async claimNextTask(project: string, criteria: { bee?: string; roles?: string[]; models?: string[] }): Promise<{ task: Task } | null> {
    return this.request<{ task: Task } | null>('POST', '/tasks/next', {
      project,
      ...criteria
    });
  }

  // Bulk operations
  async dumpProject(project: string): Promise<{ 
    project: string; 
    tasks: Task[]; 
    dependencies: any[];
    submissions: any[] 
  }> {
    return this.request('GET', `/projects/${project}/dump`);
  }

  async loadProject(project: string, data: any, replace?: boolean): Promise<void> {
    return this.request<void>('POST', `/projects/${project}/load`, data, {
      replace: replace ? 'true' : 'false'
    });
  }
}
