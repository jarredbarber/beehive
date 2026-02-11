export enum TaskState {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  PENDING_REVIEW = 'pending_review',
  CLOSED = 'closed',
  FAILED = 'failed',
  BLOCKED = 'blocked'
}

export interface Task {
  id: string;
  project: string;
  description: string;
  state: TaskState;
  role?: string;
  priority: number;
  dependencies: string[];
  summary?: string;
  details?: string;
  status?: string;
  prUrl?: string;
  claimedBy?: string;
  parentTask?: string;
  reviewsTask?: string;
  testCommand?: string;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  rolePrompt?: string;
}

export interface Submission {
  pr_url: string;
  summary: string;
  details?: string;
  follow_up_tasks?: CreateTaskInput[];
  log?: string;
}

export interface Project {
  name: string;
  repo: string;
  config: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  keyHash: string;
  project: string;
  role: 'admin' | 'bee';
  label?: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface CreateTaskInput {
  description: string;
  role?: string;
  priority: number;
  testCommand?: string;
  dependencies?: string[];
  parentTask?: string;
}

export interface UpdateTaskInput {
  description?: string;
  role?: string;
  priority?: number;
  state?: TaskState;
  status?: string;
  testCommand?: string;
  sessionId?: string;
  prUrl?: string;
  dependencies?: string[];
}

export interface TaskStore {
  listTasks(project: string, filters?: { state?: TaskState; role?: string }): Promise<Task[]>;
  getTask(project: string, id: string): Promise<Task | null>;
  createTask(project: string, task: CreateTaskInput): Promise<Task>;
  claimTask(project: string, id: string, bee?: string): Promise<Task | 'not_found' | 'conflict'>;
  submitTask(project: string, id: string, submission: Submission): Promise<Task | 'not_found'>;
  approveTask(project: string, id: string): Promise<Task | 'not_found'>;
  rejectTask(project: string, id: string, reason: string): Promise<Task | 'not_found'>;
  failTask(project: string, id: string, error: string, details?: string): Promise<Task | 'not_found'>;
  reopenTask(project: string, id: string): Promise<Task | 'not_found'>;
  updateTask(project: string, id: string, input: UpdateTaskInput): Promise<Task | 'not_found'>;
  getTaskLog(project: string, id: string): Promise<string[] | 'not_found'>;
  claimNextTask(project: string, criteria: { bee?: string; roles?: string[] }): Promise<Task | null>;
  
  // Project management (needed for POST /projects)
  createProject(project: Partial<Project> & { name: string }): Promise<{ project: Project; adminKey: string }>;
  getProject(name: string): Promise<Project | null>;

  // Key management
  createKey(project: string, role: 'admin' | 'bee', label?: string): Promise<{ key: string; apiKey: ApiKey }>;
  listKeys(project: string): Promise<ApiKey[]>;
  revokeKey(project: string, keyHash: string): Promise<boolean>;
  listProjects(): Promise<string[]>;
}
