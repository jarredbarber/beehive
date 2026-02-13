import { Hono } from 'hono';
import config from './config.js';

const app = new Hono();

// Note: Presence and message queues are in-memory (global to the isolate).
// This is suitable for single-isolate deployments. For multi-isolate, 
// Durable Objects or KV would be required.
const agents = new Map(); // name -> { lastSeen: timestamp }
const messages = new Map(); // name -> Array<{ sender, text, group?, timestamp }>

const TIMEOUT_MS = 15000;

// Auth Middleware
app.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  const apiKeys = (config.HIVE_API_KEYS || '').split(',').filter(Boolean);
  
  if (!auth || !auth.startsWith('Bearer ') || !apiKeys.includes(auth.substring(7))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// POST /register
app.post('/register', async (c) => {
  const { name } = await c.req.json();
  if (!name) return c.json({ error: 'Name required' }, 400);
  agents.set(name, { lastSeen: Date.now() });
  return c.json({ status: 'registered' });
});

// GET /agents
app.get('/agents', (c) => {
  const now = Date.now();
  const online = Array.from(agents.entries())
    .filter(([_, info]) => now - info.lastSeen < TIMEOUT_MS)
    .map(([name]) => name);
  return c.json({ agents: online });
});

// GET /messages/:name
app.get('/messages/:name', (c) => {
  const name = c.req.param('name');
  agents.set(name, { lastSeen: Date.now() });
  const queue = messages.get(name) || [];
  messages.set(name, []);
  return c.json({ messages: queue });
});

// POST /send
app.post('/send', async (c) => {
  const { target, text, sender } = await c.req.json();
  if (!target || !text || !sender) return c.json({ error: 'Missing fields' }, 400);
  
  const groups = config.HIVE_GROUPS || {};
  const isGroup = !!groups[target];
  let recipients = isGroup ? groups[target] : [target];
  
  const now = Date.now();
  recipients = recipients.filter(r => r !== sender && (!isGroup || (agents.has(r) && (now - agents.get(r).lastSeen < TIMEOUT_MS))));
  
  recipients.forEach(r => {
    const q = messages.get(r) || [];
    q.push({ sender, text, group: isGroup ? target : undefined, timestamp: Math.floor(now / 1000) });
    if (q.length > 100) q.shift();
    messages.set(r, q);
  });
  
  return c.json(isGroup ? { status: 'sent_to_group', recipients } : { status: 'sent' });
});

// GET /tasks
app.get('/tasks', async (c) => {
  const status = c.req.query('status');
  const assignee = c.req.query('assignee');
  
  let query = 'SELECT * FROM tasks';
  const params = [];
  if (status || assignee) {
    query += ' WHERE ';
    const filters = [];
    if (status) { filters.push('status = ?'); params.push(status); }
    if (assignee) { filters.push('assignee = ?'); params.push(assignee); }
    query += filters.join(' AND ');
  }
  
  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ tasks: results });
});

// POST /tasks
app.post('/tasks', async (c) => {
  const { title, assignee, body } = await c.req.json();
  if (!title) return c.json({ error: 'Title required' }, 400);
  
  const id = crypto.randomUUID().substring(0, 4);
  await c.env.DB.prepare('INSERT INTO tasks (id, title, assignee, body) VALUES (?, ?, ?, ?)')
    .bind(id, title, assignee || null, body || null).run();
  
  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return c.json(task);
});

// PATCH /tasks/:id
app.patch('/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const fields = Object.keys(data).filter(f => ['title', 'status', 'assignee', 'body'].includes(f));
  
  if (!fields.length) return c.json({ error: 'No fields to update' }, 400);
  
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const result = await c.env.DB.prepare(`UPDATE tasks SET ${setClause}, updated_at = (strftime('%s', 'now')) WHERE id = ?`)
    .bind(...fields.map(f => data[f]), id).run();
    
  if (!result.success) return c.json({ error: 'Update failed' }, 500);
  
  const updated = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  if (!updated) return c.json({ error: 'Task not found' }, 404);
  return c.json(updated);
});

export default app;
