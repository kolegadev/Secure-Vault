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
