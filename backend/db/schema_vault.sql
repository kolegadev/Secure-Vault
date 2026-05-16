-- Skills Registry (needed for env_vars FK)
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

-- Trigger to auto-update updated_at on env_vars
CREATE TRIGGER IF NOT EXISTS update_env_vars_timestamp
AFTER UPDATE ON env_vars
BEGIN
  UPDATE env_vars SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
