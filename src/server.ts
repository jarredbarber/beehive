import fastify from 'fastify';
import { createHmac } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Octokit } from '@octokit/rest';
import matter from 'gray-matter';
import { LocalTaskStore } from './store/local.js';
import { TaskState } from './types.js';
import { hashKey } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const server = fastify({ logger: true });
const store = new LocalTaskStore();

/**
 * Load workflow prompts from the filesystem.
 */
async function loadWorkflow(workflow: string, role: string) {
  const searchPaths = [
    join(process.cwd(), '.bh', 'workflows', workflow),
    join(process.cwd(), 'workflows', workflow),
    join(__dirname, '..', 'workflows', workflow),
  ];

  let preamble = '';
  let rolePrompt = '';
  let model = 'medium';

  for (const dir of searchPaths) {
    const preamblePath = join(dir, '_preamble.md');
    const rolePath = join(dir, `${role}.md`);

    if (existsSync(rolePath)) {
      const roleContent = readFileSync(rolePath, 'utf-8');
      const parsed = matter(roleContent);
      rolePrompt = parsed.content;
      model = (parsed.data.model as string) || model;

      if (existsSync(preamblePath)) {
        preamble = readFileSync(preamblePath, 'utf-8');
      }
      break;
    }
  }

  return { content: rolePrompt, preamble, model };
}

// Auth Middleware
server.addHook('preHandler', async (request, reply) => {
  // Unauthenticated routes
  if (request.method === 'POST' && request.url === '/projects') {
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const key = authHeader.substring(7);
  const keyHash = hashKey(key);
  const apiKey = await store.getApiKey(keyHash);

  if (!apiKey) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  // Attach apiKey to request for route handlers
  (request as any).apiKey = apiKey;

  // Role-based access control
  if (apiKey.role === 'admin') {
    return; // Admin can do everything
  }

  // Bee permissions
  const beeEndpoints = [
    { method: 'GET', url: '/tasks' },
    { method: 'POST', url: '/tasks/next' },
    { method: 'POST', url: /^\/tasks\/[^\/]+\/claim$/ },
    { method: 'POST', url: /^\/tasks\/[^\/]+\/submit$/ },
    { method: 'POST', url: /^\/tasks\/[^\/]+\/fail$/ },
    { method: 'POST', url: /^\/tasks\/[^\/]+\/block$/ },
    { method: 'PATCH', url: /^\/tasks\/[^\/]+$/ },
    { method: 'GET', url: /^\/tasks\/[^\/]+\/log$/ },
    { method: 'PATCH', url: /^\/tasks\/[^\/]+\/status$/ },
    { method: 'GET', url: /^\/context\/[^\/]+$/ },
    { method: 'GET', url: /^\/workflows\/[^\/]+\/[^\/]+$/ },
  ];

  const url = request.url.split('?')[0];
  const isAllowed = beeEndpoints.some(endpoint => {
    if (endpoint.method !== request.method) return false;
    if (endpoint.url instanceof RegExp) {
      return endpoint.url.test(url);
    }
    return endpoint.url === url;
  });

  if (!isAllowed) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  // Ensure bee is acting on its project
  const body = request.body as any;
  const query = request.query as any;
  const project = body?.project || query?.project;
  
  if (project && project !== apiKey.project) {
    return reply.status(403).send({ error: 'Forbidden: Project mismatch' });
  }
});

// POST /projects
server.post('/projects', async (request, reply) => {
  const body = request.body as { name: string; repo?: string; config?: string };
  if (!body.name) {
    return reply.status(400).send({ error: 'Project name is required' });
  }
  const result = await store.createProject(body);
  return result;
});

// GET /tasks
server.get('/tasks', async (request, reply) => {
  const query = request.query as { project: string; state?: TaskState; role?: string };
  if (!query.project) {
    return reply.status(400).send({ error: 'Project query parameter is required' });
  }
  const tasks = await store.listTasks(query.project, {
    state: query.state,
    role: query.role
  });
  return tasks;
});

// POST /tasks
server.post('/tasks', async (request, reply) => {
  const body = request.body as { 
    project: string; 
    description: string; 
    role?: string; 
    priority: number; 
    dependencies?: string[]; 
    parentTask?: string;
  };
  if (!body.project || !body.description) {
    return reply.status(400).send({ error: 'Project and description are required' });
  }
  const task = await store.createTask(body.project, body);
  return task;
});

// POST /tasks/next
server.post('/tasks/next', async (request, reply) => {
  const body = request.body as { 
    project: string; 
    bee?: string; 
    models?: string[]; 
    roles?: string[];
  };
  if (!body.project) {
    return reply.status(400).send({ error: 'Project is required' });
  }
  const task = await store.claimNextTask(body.project, {
    bee: body.bee,
    roles: body.roles
  });
  if (!task) {
    return reply.status(204).send();
  }

  // Load workflow context
  const projectConfig = await store.getProject(body.project);
  let workflow = 'coding';
  if (projectConfig?.config) {
    const workflowMatch = projectConfig.config.match(/workflow:\s*['"]?([^'"\s]+)['"]?/);
    if (workflowMatch) workflow = workflowMatch[1];
  }

  const workflowData = await loadWorkflow(workflow, task.role || 'code').catch(err => {
    console.warn(`Failed to load workflow ${workflow}/${task.role}: ${err.message}`);
    return null;
  });

  return { 
    task: {
      ...task,
      rolePrompt: workflowData?.content,
      preamble: workflowData?.preamble,
      model: workflowData?.model
    } 
  };
});

// POST /tasks/:id/claim
server.post<{ Params: { id: string } }>('/tasks/:id/claim', async (request, reply) => {
  const { id } = request.params;
  const body = request.body as { project: string; bee?: string };
  if (!body.project) {
    return reply.status(400).send({ error: 'Project is required' });
  }
  const result = await store.claimTask(body.project, id, body.bee);
  if (result === 'not_found') return reply.status(404).send({ error: 'Task not found' });
  if (result === 'conflict') return reply.status(409).send({ error: 'Task already claimed' });
  return result;
});

// POST /tasks/:id/submit
server.post<{ Params: { id: string } }>('/tasks/:id/submit', async (request, reply) => {
  const { id } = request.params;
  const body = request.body as {
    project: string;
    pr_url: string;
    summary: string;
    details?: string;
    follow_up_tasks?: any[];
    log?: string;
  };
  if (!body.project || !body.pr_url || !body.summary) {
    return reply.status(400).send({ error: 'Project, pr_url, and summary are required' });
  }
  const result = await store.submitTask(body.project, id, body);
  if (result === 'not_found') {
    return reply.status(404).send({ error: 'Task not found' });
  }
  return result;
});

// POST /tasks/:id/approve
server.post<{ Params: { id: string } }>('/tasks/:id/approve', async (request, reply) => {
  const { id } = request.params;
  const body = request.body as { project: string };
  if (!body.project) {
    return reply.status(400).send({ error: 'Project is required' });
  }

  // Get the task first to check for prUrl
  const task = await store.getTask(body.project, id);
  if (!task) {
    return reply.status(404).send({ error: 'Task not found' });
  }

  // If task has a PR, try to merge it first
  if (task.prUrl && process.env.GITHUB_TOKEN) {
    try {
      await mergePullRequest(task.prUrl, process.env.GITHUB_TOKEN);
      console.log(`✅ Merged PR: ${task.prUrl}`);
    } catch (error: any) {
      console.error(`❌ Failed to merge PR: ${error.message}`);
      return reply.status(400).send({ 
        error: 'PR merge failed', 
        details: error.message,
        hint: 'PR may have conflicts or failing checks. Resolve on GitHub first.'
      });
    }
  }

  // Now execute the submission
  const result = await store.approveTask(body.project, id);
  if (result === 'not_found') {
    return reply.status(404).send({ error: 'Task not found' });
  }
  return result;
});

// POST /tasks/:id/reject
server.post<{ Params: { id: string } }>('/tasks/:id/reject', async (request, reply) => {
  const { id } = request.params;
  const body = request.body as { project: string; reason: string };
  if (!body.project || !body.reason) {
    return reply.status(400).send({ error: 'Project and reason are required' });
  }

  // Get task to find PR
  const task = await store.getTask(body.project, id);
  if (!task) {
    return reply.status(404).send({ error: 'Task not found' });
  }

  // Comment on PR if it exists
  if (task.prUrl && process.env.GITHUB_TOKEN) {
    try {
      await commentOnPullRequest(task.prUrl, body.reason, process.env.GITHUB_TOKEN);
      console.log(`💬 Commented on PR: ${task.prUrl}`);
    } catch (error: any) {
      console.warn(`⚠️  Failed to comment on PR: ${error.message}`);
      // Don't fail rejection if comment fails
    }
  }

  const result = await store.rejectTask(body.project, id, body.reason);
  if (result === 'not_found') {
    return reply.status(404).send({ error: 'Task not found' });
  }
  return result;
});

// POST /tasks/:id/fail
server.post<{ Params: { id: string } }>('/tasks/:id/fail', async (request, reply) => {
  const { id } = request.params;
  const body = request.body as { project: string; error: string; details?: string };
  if (!body.project || !body.error) {
    return reply.status(400).send({ error: 'Project and error are required' });
  }
  const result = await store.failTask(body.project, id, body.error, body.details);
  if (result === 'not_found') return reply.status(404).send({ error: 'Task not found' });
  return result;
});

// POST /tasks/:id/block
server.post<{ Params: { id: string } }>('/tasks/:id/block', async (request, reply) => {
  const { id } = request.params;
  const body = request.body as { project: string; reason: string };
  if (!body.project || !body.reason) {
    return reply.status(400).send({ error: 'Project and reason are required' });
  }
  const result = await store.updateTask(body.project, id, { 
    state: TaskState.BLOCKED, 
    status: body.reason 
  });
  if (result === 'not_found') return reply.status(404).send({ error: 'Task not found' });
  return result;
});

// GET /tasks/:id/log
server.get<{ Params: { id: string } }>('/tasks/:id/log', async (request, reply) => {
  const { id } = request.params;
  const query = request.query as { project: string };
  if (!query.project) {
    return reply.status(400).send({ error: 'Project query parameter is required' });
  }

  const log = await store.getTaskLog(query.project, id);
  if (log === 'not_found') {
    return reply.status(404).send({ error: 'Task not found' });
  }
  return log;
});

// PATCH /tasks/:id/status
server.patch<{ Params: { id: string } }>('/tasks/:id/status', async (request, reply) => {
  const { id } = request.params;
  const body = request.body as { project: string; status: string };
  if (!body.project || !body.status) {
    return reply.status(400).send({ error: 'Project and status are required' });
  }
  const result = await store.updateTask(body.project, id, { status: body.status });
  if (result === 'not_found') return reply.status(404).send({ error: 'Task not found' });
  return result;
});

// PATCH /tasks/:id
server.patch<{ Params: { id: string } }>('/tasks/:id', async (request, reply) => {
  const { id } = request.params;
  const body = request.body as any;
  if (!body.project) {
    return reply.status(400).send({ error: 'Project is required' });
  }

  const result = await store.updateTask(body.project, id, body);
  if (result === 'not_found') {
    return reply.status(404).send({ error: 'Task not found' });
  }
  return result;
});

// GET /context/:role
server.get<{ Params: { role: string } }>('/context/:role', async (request, reply) => {
  const { role } = request.params;
  return { role, prompt: `Placeholder system prompt for role: ${role}` };
});

// Key management endpoints (Admin only)

// POST /keys
server.post('/keys', async (request, reply) => {
  const body = request.body as { project: string; role: 'admin' | 'bee'; label?: string };
  if (!body.project || !body.role) {
    return reply.status(400).send({ error: 'Project and role are required' });
  }
  return await store.createKey(body.project, body.role, body.label);
});

// GET /keys
server.get('/keys', async (request, reply) => {
  const query = request.query as { project: string };
  if (!query.project) {
    return reply.status(400).send({ error: 'Project is required' });
  }
  return await store.listKeys(query.project);
});

// DELETE /keys/:hash
server.delete<{ Params: { hash: string } }>('/keys/:hash', async (request, reply) => {
  const { hash } = request.params;
  const query = request.query as { project: string };
  if (!query.project) {
    return reply.status(400).send({ error: 'Project is required' });
  }
  const success = await store.revokeKey(query.project, hash);
  return { success };
});

// GET /workflows/:workflow/:role
server.get<{ Params: { workflow: string; role: string } }>('/workflows/:workflow/:role', async (request, reply) => {
  const { workflow, role } = request.params;
  try {
    const workflowData = await loadWorkflow(workflow, role);
    return workflowData;
  } catch (err) {
    return reply.status(404).send({ error: 'Workflow not found' });
  }
});

// POST /webhooks/github
server.post('/webhooks/github', async (request, reply) => {
  // 1. Verify GitHub signature
  const signature = request.headers['x-hub-signature-256'] as string;
  const payload = JSON.stringify(request.body);
  
  if (!verifyGitHubSignature(payload, signature)) {
    return reply.status(401).send({ error: 'Invalid signature' });
  }

  const event = request.body as any;
  
  // 2. Handle pull_request events
  if (event.action === 'closed' && event.pull_request?.merged) {
    const prUrl = event.pull_request.html_url;
    
    // 3. Find task with matching prUrl in pending_review state
    const allProjects = await store.listProjects();
    
    for (const projectName of allProjects) {
      const tasks = await store.listTasks(projectName, { state: TaskState.PENDING_REVIEW });
      const matchingTask = tasks.find(t => t.prUrl === prUrl);
      
      if (matchingTask) {
        // 4. Auto-execute submission
        await store.approveTask(projectName, matchingTask.id);
        console.log(`✅ Auto-executed submission for ${matchingTask.id} (PR merged)`);
        return reply.status(200).send({ message: 'Submission executed', taskId: matchingTask.id });
      }
    }
    
    return reply.status(200).send({ message: 'No matching task found' });
  }
  
  // Other events: ignore
  return reply.status(200).send({ message: 'Event ignored' });
});

// POST /tasks/:id/log
server.post<{ Params: { id: string } }>('/tasks/:id/log', async (request, reply) => {
  const { id } = request.params;
  const body = request.body as any;
  const { project, content, attempt } = body;

  if (!project || !content) {
    return reply.status(400).send({ error: 'Project and log content are required' });
  }

  const result = await store.uploadLog(project, id, content, attempt);
  return result;
});

// Signature verification helper
function verifyGitHubSignature(payload: string, signature: string): boolean {
  if (!signature) return false;
  
  const secret = process.env.GITHUB_WEBHOOK_SECRET || '';
  if (!secret) {
    console.warn('⚠️  GITHUB_WEBHOOK_SECRET not set - webhook verification disabled');
    return true; // Allow in development
  }
  
  const hmac = createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  return signature === digest;
}

// Helper function to merge PR
async function mergePullRequest(prUrl: string, token: string): Promise<void> {
  const octokit = new Octokit({ auth: token });
  
  // Parse PR URL: https://github.com/owner/repo/pull/123
  const match = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
  if (!match) {
    throw new Error('Invalid PR URL format');
  }
  
  const [, owner, repo, prNumber] = match;
  
  // Merge using squash method
  await octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: parseInt(prNumber, 10),
    merge_method: 'squash'
  });
}

// Helper to comment on PR
async function commentOnPullRequest(prUrl: string, reason: string, token: string): Promise<void> {
  const octokit = new Octokit({ auth: token });
  
  const match = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
  if (!match) {
    throw new Error('Invalid PR URL format');
  }
  
  const [, owner, repo, prNumber] = match;
  
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: parseInt(prNumber, 10),
    body: `❌ **Submission Rejected**\n\n**Reason:** ${reason}\n\n---\n\nPlease address the feedback and resubmit.`
  });
}

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3847');
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
