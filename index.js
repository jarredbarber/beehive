const http = require('node:http');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const PORT = process.env.HIVE_PORT || 3141;
const API_KEYS = (process.env.HIVE_API_KEYS || '').split(',').filter(Boolean);
const TIMEOUT_MS = parseInt(process.env.HIVE_TIMEOUT_MS || '15000');
const DB_PATH = process.env.HIVE_DB_PATH || './hive.db';
const GROUPS = JSON.parse(process.env.HIVE_GROUPS || '{}');

const db = new Database(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  assignee TEXT,
  body TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
)`);

const agents = new Map(); // name -> { lastSeen: timestamp }
const messages = new Map(); // name -> Array<{ sender, text, group?, timestamp }>

const json = (res, data, status = 200) => {
  res.writeHead(status, { 
    'Content-Type': 'application/json', 
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
  });
  res.end(JSON.stringify(data));
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, null, 204);

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ') || !API_KEYS.includes(auth.substring(7))) {
    return json(res, { error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  
  let body = '';
  try {
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : {};

    if (path === '/register' && req.method === 'POST') {
      if (!data.name) return json(res, { error: 'Name required' }, 400);
      agents.set(data.name, { lastSeen: Date.now() });
      return json(res, { status: 'registered' });
    }

    if (path === '/agents' && req.method === 'GET') {
      const now = Date.now();
      const online = Array.from(agents.entries())
        .filter(([_, info]) => now - info.lastSeen < TIMEOUT_MS)
        .map(([name]) => name);
      return json(res, { agents: online });
    }

    if (path.startsWith('/messages/') && req.method === 'GET') {
      const name = path.split('/')[2];
      agents.set(name, { lastSeen: Date.now() });
      const queue = messages.get(name) || [];
      messages.set(name, []);
      return json(res, { messages: queue });
    }

    if (path === '/send' && req.method === 'POST') {
      const { target, text, sender } = data;
      if (!target || !text || !sender) return json(res, { error: 'Missing fields' }, 400);
      
      const isGroup = !!GROUPS[target];
      let recipients = isGroup ? GROUPS[target] : [target];
      
      if (isGroup) {
        const now = Date.now();
        recipients = recipients.filter(r => r !== sender && agents.has(r) && (now - agents.get(r).lastSeen < TIMEOUT_MS));
      } else {
        recipients = recipients.filter(r => r !== sender);
      }
      
      recipients.forEach(r => {
        const q = messages.get(r) || [];
        q.push({ sender, text, group: isGroup ? target : undefined, timestamp: Math.floor(Date.now() / 1000) });
        if (q.length > 100) q.shift();
        messages.set(r, q);
      });
      
      return json(res, isGroup ? { status: 'sent_to_group', recipients } : { status: 'sent' });
    }

    if (path === '/tasks') {
      if (req.method === 'GET') {
        let sql = 'SELECT * FROM tasks';
        const params = [];
        const filters = [];
        if (url.searchParams.has('status')) { filters.push('status = ?'); params.push(url.searchParams.get('status')); }
        if (url.searchParams.has('assignee')) { filters.push('assignee = ?'); params.push(url.searchParams.get('assignee')); }
        if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
        return json(res, { tasks: db.prepare(sql).all(...params) });
      }
      if (req.method === 'POST') {
        const id = crypto.randomBytes(2).toString('hex');
        const { title, assignee, body: taskBody } = data;
        if (!title) return json(res, { error: 'Title required' }, 400);
        db.prepare('INSERT INTO tasks (id, title, assignee, body) VALUES (?, ?, ?, ?)').run(id, title, assignee || null, taskBody || null);
        return json(res, db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
      }
    }

    if (path.startsWith('/tasks/') && req.method === 'PATCH') {
      const id = path.split('/')[2];
      const fields = Object.keys(data).filter(f => ['title', 'status', 'assignee', 'body'].includes(f));
      if (!fields.length) return json(res, { error: 'No fields to update' }, 400);
      
      const setClause = fields.map(f => `${f} = ?`).join(', ');
      const result = db.prepare(`UPDATE tasks SET ${setClause}, updated_at = strftime('%s', 'now') WHERE id = ?`).run(...fields.map(f => data[f]), id);
      if (result.changes === 0) return json(res, { error: 'Task not found' }, 404);
      return json(res, db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
    }

    json(res, { error: 'Not found' }, 404);
  } catch (err) {
    json(res, { error: err.message }, 400);
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Hive v3 running on port ${PORT}`));

const shutdown = () => { console.log('Shutting down...'); db.close(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
