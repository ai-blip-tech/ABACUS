CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  settings_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_domains (
  hostname TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE sessions ADD COLUMN tenant_id TEXT;
ALTER TABLE generations ADD COLUMN tenant_id TEXT;
ALTER TABLE projects ADD COLUMN tenant_id TEXT;

INSERT OR IGNORE INTO tenants (id, slug, name, status, settings_json, created_at, updated_at)
VALUES ('tenant_norrmobler', 'norrmobler', 'NORR Møbler', 'active', '{}', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO tenant_domains (hostname, tenant_id, created_at)
VALUES ('norr-club.testaimoblernorr.chatgpt.site', 'tenant_norrmobler', datetime('now'));

INSERT OR IGNORE INTO tenant_memberships (tenant_id, user_id, role, created_at)
SELECT 'tenant_norrmobler', id, CASE WHEN role = 'admin' THEN 'tenant_admin' ELSE 'member' END, datetime('now') FROM users;

UPDATE sessions SET tenant_id = 'tenant_norrmobler' WHERE tenant_id IS NULL OR tenant_id = '';
UPDATE generations SET tenant_id = 'tenant_norrmobler' WHERE tenant_id IS NULL OR tenant_id = '';
UPDATE projects SET tenant_id = 'tenant_norrmobler' WHERE tenant_id IS NULL OR tenant_id = '';

CREATE INDEX IF NOT EXISTS idx_sessions_tenant_token ON sessions(tenant_id, token_hash);
CREATE INDEX IF NOT EXISTS idx_generations_tenant_user_created ON generations(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_user_updated ON projects(tenant_id, user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_tenant_user ON ai_jobs(tenant_id, user_id, created_at DESC);
