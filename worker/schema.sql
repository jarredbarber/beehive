CREATE TABLE projects (
  name TEXT PRIMARY KEY,
  repo TEXT,                   -- e.g. "jarredbarber/erdos-728"
  config TEXT,                 -- full .bh/config.yaml as text
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  description TEXT,
  role TEXT,
  state TEXT DEFAULT 'open',   -- open, in_progress, pending_review, closed, failed, blocked
  priority INTEGER DEFAULT 2,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  claimed_by TEXT,             -- bee identifier
  summary TEXT,
  details TEXT,
  status TEXT,                 -- progress text
  pr_url TEXT,
  parent_task TEXT,            -- task that spawned this (null for manual/root tasks)
  reviews_task TEXT,           -- pr_review tasks: which work task
  test_command TEXT             -- validation command
);

CREATE TABLE submissions (
  task_id TEXT PRIMARY KEY,
  pr_url TEXT NOT NULL,
  summary TEXT,
  details TEXT,
  follow_up_tasks TEXT,        -- JSON array
  log TEXT,
  submitted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL,
  depends_on TEXT NOT NULL,
  PRIMARY KEY (task_id, depends_on)
);

CREATE TABLE task_logs (
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  content BLOB,               -- gzipped text (5-10x compression on agent logs)
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, attempt)
);

CREATE TABLE api_keys (
  key_hash TEXT PRIMARY KEY,   -- SHA-256 of the key (never store plaintext)
  project TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'admin' | 'bee'
  label TEXT,                   -- e.g. "jarred-laptop", "ci-runner-1"
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE INDEX idx_tasks_project_state ON tasks(project, state);
CREATE INDEX idx_tasks_project_role ON tasks(project, role);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
