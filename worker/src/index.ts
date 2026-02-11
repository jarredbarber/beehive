import { Hono } from 'hono';
import { Octokit } from '@octokit/rest';

type Bindings = {
  DB: D1Database;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_TOKEN: string;
};

type Variables = {
  apiKey: { project: string; role: string };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Helper for SHA-256 hashing in Workers
async function hashKey(key: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Helper to merge PR
async function mergePullRequest(prUrl: string, token: string): Promise<void> {
  const octokit = new Octokit({ auth: token });
  
  const match = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
  if (!match) {
    throw new Error('Invalid PR URL format');
  }
  
  const [, owner, repo, prNumber] = match;
  
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

// Auth Middleware
app.use('*', async (c, next) => {
  const path = c.req.path;
  const method = c.req.method;

  // Unauthenticated routes
  if (method === 'POST' && (path === '/projects' || path === '/webhooks/github')) {
    return await next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const key = authHeader.substring(7);
  const keyHash = await hashKey(key);

  const apiKey = await c.env.DB.prepare(
    'SELECT * FROM api_keys WHERE key_hash = ?'
  ).bind(keyHash).first<{ project: string; role: string }>();

  if (!apiKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Update last_used_at
  c.executionCtx.waitUntil(
    c.env.DB.prepare('UPDATE api_keys SET last_used_at = datetime("now") WHERE key_hash = ?')
      .bind(keyHash).run()
  );

  // Set context for handlers
  c.set('apiKey', apiKey);

  if (apiKey.role === 'admin') {
    return await next();
  }

  // Bee permissions
  const beeEndpoints = [
    { method: 'GET', url: /^\/tasks$/ },
    { method: 'POST', url: /^\/tasks\/next$/ },
    { method: 'GET', url: /^\/tasks\/[^\/]+$/ },
    { method: 'POST', url: /^\/tasks\/[^\/]+\/claim$/ },
    { method: 'POST', url: /^\/tasks\/[^\/]+\/release$/ },
    { method: 'POST', url: /^\/tasks\/[^\/]+\/submit$/ },
    { method: 'POST', url: /^\/tasks\/[^\/]+\/fail$/ },
    { method: 'POST', url: /^\/tasks\/[^\/]+\/block$/ },
    { method: 'PATCH', url: /^\/tasks\/[^\/]+$/ },
    { method: 'GET', url: /^\/tasks\/[^\/]+\/log$/ },
    { method: 'PATCH', url: /^\/tasks\/[^\/]+\/status$/ },
    { method: 'GET', url: /^\/context\/[^\/]+$/ },
  ];

  const isAllowed = beeEndpoints.some(endpoint => {
    if (endpoint.method !== method) return false;
    return endpoint.url.test(path);
  });

  if (!isAllowed) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  return await next();
});

// POST /tasks/:id/release
app.post('/tasks/:id/release', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<any>();
  const project = body.project;

  if (!project) return c.json({ error: 'Project is required' }, 400);

  const result = await c.env.DB.prepare(
    'UPDATE tasks SET state = "open", claimed_by = NULL, updated_at = datetime("now") WHERE id = ? AND project = ? AND state = "in_progress" RETURNING *'
  ).bind(id, project).first();

  if (!result) return c.json({ error: 'Task not found or not in progress' }, 404);
  return c.json(formatTask(result));
});

// PATCH /tasks/:id
app.patch('/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<any>();
  const project = body.project;

  if (!project) return c.json({ error: 'Project is required' }, 400);

  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND project = ?')
    .bind(id, project).first<any>();
  
  if (!task) return c.json({ error: 'Task not found' }, 404);

  const updates: string[] = [];
  const values: any[] = [];
  const statements: any[] = [];

  if (body.description !== undefined) {
    updates.push('description = ?');
    values.push(body.description);
  }
  if (body.priority !== undefined) {
    updates.push('priority = ?');
    values.push(body.priority);
  }
  if (body.role !== undefined) {
    updates.push('role = ?');
    values.push(body.role);
  }

  if (updates.length > 0) {
    updates.push('updated_at = datetime("now")');
    const query = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND project = ?`;
    statements.push(c.env.DB.prepare(query).bind(...values, id, project));
  }

  if (body.dependencies !== undefined && Array.isArray(body.dependencies)) {
    statements.push(c.env.DB.prepare('DELETE FROM task_dependencies WHERE task_id = ?').bind(id));
    for (const depId of body.dependencies) {
      statements.push(c.env.DB.prepare('INSERT INTO task_dependencies (task_id, depends_on) VALUES (?, ?)').bind(id, depId));
    }
  }

  if (statements.length === 0) return c.json({ error: 'No fields to update' }, 400);

  await c.env.DB.batch(statements);
  const updated = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return c.json(formatTask(updated));
});

// Helper to generate IDs (project-xxxx)
function generateSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper to generate a key
function generateKey(role: 'admin' | 'bee'): string {
  const prefix = role === 'admin' ? 'bh_ak_' : 'bh_bk_';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const randomPart = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}${randomPart}`;
}

// Helper to format task for CLI (snake_case -> camelCase)
function formatTask(task: any) {
  if (!task) return task;
  return {
    ...task,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    claimedBy: task.claimed_by,
    prUrl: task.pr_url,
    parentTask: task.parent_task,
    reviewsTask: task.reviews_task,
    // dependencies is handled separately as it comes from a different table
  };
}

// POST /projects
app.post('/projects', async (c) => {
  const body = await c.req.json<{ name: string; repo?: string; config?: string }>();
  if (!body.name) return c.json({ error: 'Project name is required' }, 400);

  const adminKey = generateKey('admin');
  const keyHash = await hashKey(adminKey);

  try {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO projects (name, repo, config) VALUES (?, ?, ?)')
        .bind(body.name, body.repo || '', body.config || ''),
      c.env.DB.prepare('INSERT INTO api_keys (key_hash, project, role, label) VALUES (?, ?, ?, ?)')
        .bind(keyHash, body.name, 'admin', 'bootstrap')
    ]);

    return c.json({ 
      project: { name: body.name, repo: body.repo || '' },
      adminKey 
    }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /tasks
app.get('/tasks', async (c) => {
  const project = c.req.query('project');
  const state = c.req.query('state');
  const role = c.req.query('role');

  if (!project) return c.json({ error: 'Project is required' }, 400);

  let query = 'SELECT *, created_at as createdAt, updated_at as updatedAt, claimed_by as claimedBy, pr_url as prUrl, parent_task as parentTask, reviews_task as reviewsTask FROM tasks WHERE project = ?';
  const params: any[] = [project];

  if (state) {
    query += ' AND state = ?';
    params.push(state);
  }
  if (role) {
    query += ' AND role = ?';
    params.push(role);
  }

  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json(results.map(formatTask));
});

// GET /tasks/:id
app.get('/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const project = c.req.query('project');

  if (!project) return c.json({ error: 'Project is required' }, 400);

  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND project = ?')
    .bind(id, project).first<any>();
  
  if (!task) return c.json({ error: 'Task not found' }, 404);

  // Get dependencies
  const { results: deps } = await c.env.DB.prepare(
    'SELECT depends_on FROM task_dependencies WHERE task_id = ?'
  ).bind(id).all();
  
  const dependencies = deps.map((d: any) => d.depends_on);

  return c.json(formatTask({ ...task, dependencies }));
});

// POST /tasks
app.post('/tasks', async (c) => {
  const body = await c.req.json<any>();
  if (!body.project || !body.description) return c.json({ error: 'Project and description are required' }, 400);

  const id = `${body.project}-${generateSuffix()}`;
  
  await c.env.DB.prepare(
    'INSERT INTO tasks (id, project, description, role, priority, parent_task) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, body.project, body.description, body.role || null, body.priority || 2, body.parentTask || null).run();

  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return c.json(formatTask(task), 201);
});

// POST /tasks/next
app.post('/tasks/next', async (c) => {
  const body = await c.req.json<any>();
  if (!body.project) return c.json({ error: 'Project is required' }, 400);

  // Simplified selection logic: priority then age
  const query = `
    SELECT t.* FROM tasks t
    LEFT JOIN task_dependencies td ON t.id = td.task_id
    WHERE t.project = ? AND t.state = 'open'
    GROUP BY t.id
    HAVING COUNT(CASE WHEN (SELECT state FROM tasks WHERE id = td.depends_on) != 'closed' THEN 1 END) = 0
    ORDER BY t.priority ASC, t.created_at ASC
    LIMIT 1
  `;

  const taskCandidate = await c.env.DB.prepare(query).bind(body.project).first<any>();

  if (!taskCandidate) return c.body(null, 204);

  // Atomic claim
  const result = await c.env.DB.prepare(
    'UPDATE tasks SET state = "in_progress", claimed_by = ?, updated_at = datetime("now") WHERE id = ? AND state = "open" RETURNING *'
  ).bind(body.bee || 'unknown', taskCandidate.id).first();

  if (!result) return c.body(null, 204);

  return c.json({ task: result });
});

// POST /tasks/:id/claim
app.post('/tasks/:id/claim', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<any>();
  
  const result = await c.env.DB.prepare(
    'UPDATE tasks SET state = "in_progress", claimed_by = ?, updated_at = datetime("now") WHERE id = ? AND state = "open" RETURNING *'
  ).bind(body.bee || 'unknown', id).first();

  if (!result) return c.json({ error: 'Task not found or already claimed' }, 409);
  return c.json(result);
});

// POST /tasks/:id/submit
app.post('/tasks/:id/submit', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<any>();

  if (!body.pr_url || !body.summary) return c.json({ error: 'pr_url and summary are required' }, 400);

  const reviewId = `${body.project}-rev-${generateSuffix()}`;

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE tasks SET state = "pending_review", updated_at = datetime("now") WHERE id = ?').bind(id),
    c.env.DB.prepare('INSERT INTO submissions (task_id, pr_url, summary, details, follow_up_tasks, log) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, body.pr_url, body.summary, body.details || null, JSON.stringify(body.follow_up_tasks || []), body.log || null),
    c.env.DB.prepare('INSERT INTO tasks (id, project, description, role, state, priority, pr_url, reviews_task) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(reviewId, body.project, `Review: submission for ${id}`, 'pr_review', 'open', 1, body.pr_url, id)
  ]);

  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return c.json(task);
});

// POST /tasks/:id/approve
app.post('/tasks/:id/approve', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<any>();
  
  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND project = ?')
    .bind(id, body.project).first<any>();
  
  if (!task) return c.json({ error: 'Task not found' }, 404);

  const submission = await c.env.DB.prepare('SELECT * FROM submissions WHERE task_id = ?').bind(id).first<any>();
  if (!submission) return c.json({ error: 'Submission not found' }, 404);

  // Try to merge PR if it exists
  if (task.pr_url && c.env.GITHUB_TOKEN) {
    try {
      await mergePullRequest(task.pr_url, c.env.GITHUB_TOKEN);
    } catch (error: any) {
      return c.json({ 
        error: 'PR merge failed', 
        details: error.message 
      }, 400);
    }
  }

  const statements = [
    c.env.DB.prepare('UPDATE tasks SET state = "closed", summary = ?, details = ?, pr_url = ?, updated_at = datetime("now") WHERE id = ?')
      .bind(submission.summary, submission.details, submission.pr_url, id),
    c.env.DB.prepare('UPDATE tasks SET state = "closed", updated_at = datetime("now") WHERE reviews_task = ?').bind(id),
    c.env.DB.prepare('DELETE FROM submissions WHERE task_id = ?').bind(id)
  ];

  const followUps = JSON.parse(submission.follow_up_tasks || '[]');
  for (const fu of followUps) {
    const fuId = `${task.project}-${generateSuffix()}`;
    statements.push(
      c.env.DB.prepare('INSERT INTO tasks (id, project, description, role, priority, parent_task) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(fuId, task.project, fu.description, fu.role, fu.priority || 2, id)
    );

    if (fu.dependencies && Array.isArray(fu.dependencies)) {
      for (const depId of fu.dependencies) {
        statements.push(
          c.env.DB.prepare('INSERT INTO task_dependencies (task_id, depends_on) VALUES (?, ?)')
            .bind(fuId, depId)
        );
      }
    }
  }

  await c.env.DB.batch(statements);
  const updatedTask = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return c.json(updatedTask);
});

// POST /tasks/:id/reject
app.post('/tasks/:id/reject', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<any>();

  if (!body.project || !body.reason) return c.json({ error: 'Project and reason are required' }, 400);

  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND project = ?')
    .bind(id, body.project).first<any>();
  
  if (!task) return c.json({ error: 'Task not found' }, 404);

  // Comment on PR if it exists
  if (task.pr_url && c.env.GITHUB_TOKEN) {
    try {
      await commentOnPullRequest(task.pr_url, body.reason, c.env.GITHUB_TOKEN);
    } catch (error: any) {
      // Don't fail rejection if comment fails, but log it
      console.warn(`Failed to comment on PR: ${error.message}`);
    }
  }

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE tasks SET state = "open", updated_at = datetime("now") WHERE id = ?').bind(id),
    c.env.DB.prepare('UPDATE tasks SET state = "closed", summary = ?, updated_at = datetime("now") WHERE reviews_task = ?')
      .bind(`Rejected: ${body.reason || 'No reason provided'}`, id),
    c.env.DB.prepare('DELETE FROM submissions WHERE task_id = ?').bind(id)
  ]);

  const updatedTask = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return c.json(updatedTask);
});

// POST /tasks/:id/fail
app.post('/tasks/:id/fail', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<any>();

  const result = await c.env.DB.prepare(
    'UPDATE tasks SET state = "failed", summary = ?, details = ?, updated_at = datetime("now") WHERE id = ? RETURNING *'
  ).bind(body.error || 'Failed', body.details || null, id).first();

  return c.json(result);
});

// POST /tasks/:id/block
app.post('/tasks/:id/block', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<any>();

  const result = await c.env.DB.prepare(
    'UPDATE tasks SET state = "blocked", status = ?, updated_at = datetime("now") WHERE id = ? RETURNING *'
  ).bind(body.reason || 'Blocked', id).first();

  return c.json(result);
});

// GET /tasks/:id/log
app.get('/tasks/:id/log', async (c) => {
  const id = c.req.param('id');
  const project = c.req.query('project');
  
  if (!project) return c.json({ error: 'Project is required' }, 400);

  const { results } = await c.env.DB.prepare('SELECT content FROM task_logs WHERE task_id = ? ORDER BY attempt ASC').bind(id).all();
  
  if (results.length === 0) {
    // Check if task exists
    const task = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ? AND project = ?').bind(id, project).first();
    if (!task) return c.json({ error: 'Task not found' }, 404);
    return c.json([]);
  }

  const logLines = results.map((row: any) => row.content);
  return c.json(logLines);
});

// PATCH /tasks/:id/status
app.patch('/tasks/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<any>();

  const result = await c.env.DB.prepare(
    'UPDATE tasks SET status = ?, updated_at = datetime("now") WHERE id = ? RETURNING *'
  ).bind(body.status, id).first();

  return c.json(result);
});

// GET /context/:role
app.get('/context/:role', async (c) => {
  const role = c.req.param('role');
  return c.json({ role, prompt: `Placeholder system prompt for ${role}` });
});

// Key management (Admin only)
app.post('/keys', async (c) => {
  const body = await c.req.json<any>();
  const key = generateKey(body.role);
  const keyHash = await hashKey(key);

  await c.env.DB.prepare(
    'INSERT INTO api_keys (key_hash, project, role, label) VALUES (?, ?, ?, ?)'
  ).bind(keyHash, body.project, body.role, body.label || null).run();

  return c.json({ key });
});

app.get('/keys', async (c) => {
  const project = c.req.query('project');
  const { results } = await c.env.DB.prepare('SELECT * FROM api_keys WHERE project = ?').bind(project).all();
  return c.json(results);
});

app.delete('/keys/:hash', async (c) => {
  const hash = c.req.param('hash');
  await c.env.DB.prepare('DELETE FROM api_keys WHERE key_hash = ?').bind(hash).run();
  return c.json({ success: true });
});

// Bulk Operations (Admin only)
app.get('/projects/:name/dump', async (c) => {
  const name = c.req.param('name');
  
  const tasks = await c.env.DB.prepare('SELECT * FROM tasks WHERE project = ?').bind(name).all();
  const dependencies = await c.env.DB.prepare('SELECT * FROM task_dependencies WHERE task_id IN (SELECT id FROM tasks WHERE project = ?)').bind(name).all();
  const submissions = await c.env.DB.prepare('SELECT * FROM submissions WHERE task_id IN (SELECT id FROM tasks WHERE project = ?)').bind(name).all();

  return c.json({
    project: name,
    tasks: tasks.results,
    dependencies: dependencies.results,
    submissions: submissions.results
  });
});

app.post('/projects/:name/load', async (c) => {
  const name = c.req.param('name');
  const body = await c.req.json<any>();
  const replace = c.req.query('replace') === 'true';

  const statements: any[] = [];

  if (replace) {
    statements.push(c.env.DB.prepare('DELETE FROM task_dependencies WHERE task_id IN (SELECT id FROM tasks WHERE project = ?)').bind(name));
    statements.push(c.env.DB.prepare('DELETE FROM submissions WHERE task_id IN (SELECT id FROM tasks WHERE project = ?)').bind(name));
    statements.push(c.env.DB.prepare('DELETE FROM tasks WHERE project = ?').bind(name));
  }

  if (body.tasks) {
    for (const task of body.tasks) {
      statements.push(c.env.DB.prepare(
        'INSERT INTO tasks (id, project, description, role, state, priority, created_at, updated_at, claimed_by, summary, details, status, pr_url, parent_task, reviews_task) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(task.id, name, task.description, task.role, task.state, task.priority, task.created_at || task.createdAt, task.updated_at || task.updatedAt, task.claimed_by || task.claimedBy, task.summary, task.details, task.status, task.pr_url || task.prUrl, task.parent_task || task.parentTask, task.reviews_task || task.reviewsTask));
    }
  }

  if (body.dependencies) {
    for (const dep of body.dependencies) {
      statements.push(c.env.DB.prepare('INSERT INTO task_dependencies (task_id, depends_on) VALUES (?, ?)').bind(dep.task_id, dep.depends_on));
    }
  }

  if (body.submissions) {
    for (const sub of body.submissions) {
      statements.push(c.env.DB.prepare(
        'INSERT INTO submissions (task_id, pr_url, summary, details, follow_up_tasks, log, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(sub.task_id, sub.pr_url, sub.summary, sub.details, sub.follow_up_tasks, sub.log, sub.submitted_at));
    }
  }

  await c.env.DB.batch(statements);
  return c.json({ success: true });
});

// Signature verification for Worker
async function verifyGitHubSignature(payload: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  if (!secret) return true; // Development mode
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const digest = 'sha256=' + Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return signature === digest;
}

// POST /webhooks/github
app.post('/webhooks/github', async (c) => {
  const body = await c.req.json() as any;
  const signature = c.req.header('x-hub-signature-256') || null;
  
  // Verify signature
  const secret = c.env.GITHUB_WEBHOOK_SECRET || '';
  if (!await verifyGitHubSignature(JSON.stringify(body), signature, secret)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // Handle PR merge
  if (body.action === 'closed' && body.pull_request?.merged) {
    const prUrl = body.pull_request.html_url;
    
    // Find all projects
    const projectsResult = await c.env.DB.prepare('SELECT DISTINCT project FROM tasks').all();
    const projects = projectsResult.results.map((r: any) => r.project);
    
    for (const project of projects) {
      const { results: tasks } = await c.env.DB.prepare(
        'SELECT * FROM tasks WHERE project = ? AND state = "pending_review"'
      ).bind(project).all();

      const matchingTask = tasks.find((t: any) => t.pr_url === prUrl);
      
      if (matchingTask) {
        // Auto-execute submission
        const id = matchingTask.id;
        const submission = await c.env.DB.prepare('SELECT * FROM submissions WHERE task_id = ?').bind(id).first<any>();
        
        if (submission) {
          const statements = [
            c.env.DB.prepare('UPDATE tasks SET state = "closed", summary = ?, details = ?, pr_url = ?, updated_at = datetime("now") WHERE id = ?')
              .bind(submission.summary, submission.details, submission.pr_url, id),
            c.env.DB.prepare('UPDATE tasks SET state = "closed", updated_at = datetime("now") WHERE reviews_task = ?').bind(id),
            c.env.DB.prepare('DELETE FROM submissions WHERE task_id = ?').bind(id)
          ];

          const followUps = JSON.parse(submission.follow_up_tasks || '[]');
          for (const fu of followUps) {
            const fuId = `${matchingTask.project}-${generateSuffix()}`;
            statements.push(
              c.env.DB.prepare('INSERT INTO tasks (id, project, description, role, priority, parent_task) VALUES (?, ?, ?, ?, ?, ?)')
                .bind(fuId, matchingTask.project, fu.description, fu.role, fu.priority || 2, id)
            );
            if (fu.dependencies && Array.isArray(fu.dependencies)) {
              for (const depId of fu.dependencies) {
                statements.push(
                  c.env.DB.prepare('INSERT INTO task_dependencies (task_id, depends_on) VALUES (?, ?)')
                    .bind(fuId, depId)
                );
              }
            }
          }

          await c.env.DB.batch(statements);
          return c.json({ message: 'Submission executed', taskId: id });
        }
      }
    }
  }

  return c.json({ message: 'Event processed' });
});

export default app;
