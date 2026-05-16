-- Environment Variables
CREATE TABLE IF NOT EXISTS env_vars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(128) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  service_name VARCHAR(128),
  api_docs_url VARCHAR(512),
  skill_id INTEGER REFERENCES skills(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_env_vars_name ON env_vars(name);
CREATE INDEX IF NOT EXISTS idx_env_vars_service ON env_vars(service_name);
CREATE INDEX IF NOT EXISTS idx_env_vars_skill ON env_vars(skill_id);

-- Skills Registry
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  path VARCHAR(512) NOT NULL UNIQUE,
  frontmatter TEXT,
  metadata TEXT,
  installed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
CREATE INDEX IF NOT EXISTS idx_skills_path ON skills(path);

-- Services
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(128) NOT NULL UNIQUE,
  description TEXT,
  swagger_url VARCHAR(512),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_services_name ON services(name);

-- Activity Log
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(64),
  target_id INTEGER,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_target ON activity_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  data TEXT,
  expires_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Vault Status (single row)
CREATE TABLE IF NOT EXISTS vault_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state TEXT NOT NULL DEFAULT 'locked' CHECK (state IN ('locked', 'unlocked', 'mounted')),
  device_path TEXT,
  mount_point TEXT,
  mapper_name TEXT,
  last_unlocked_at DATETIME,
  last_locked_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO vault_status (id, state) VALUES (1, 'locked');

-- Trigger to auto-update updated_at on env_vars
CREATE TRIGGER IF NOT EXISTS update_env_vars_timestamp
AFTER UPDATE ON env_vars
BEGIN
  UPDATE env_vars SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
