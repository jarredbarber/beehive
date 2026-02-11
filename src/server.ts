import fastify from 'fastify';
import { LocalTaskStore } from './store/local.js';
import { TaskState } from './types.js';
import { hashKey } from './auth.js';

const server = fastify({ logger: true });
const store = new LocalTaskStore();

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
    { method: 'GET', url: /^\/tasks\/[^\/]+\/log$/ },
    { method: 'PATCH', url: /^\/tasks\/[^\/]+\/status$/ },
    { method: 'GET', url: /^\/context\/[^\/]+$/ },
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
    testCommand?: string; 
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
  return { task };
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
    return reply.status(400).send({ error: 'Project is required' });
  }
  const result = await store.getTaskLog(query.project, id);
  if (result === 'not_found') return reply.status(404).send({ error: 'Task not found' });
  return result;
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
