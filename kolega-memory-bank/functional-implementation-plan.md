# OpenClaw Secure Vault — Functional Implementation Plan

## Status: IMPLEMENTED

All phases have been completed and the application is fully functional.

---

## 1. Scope & Objectives

### In Scope
- Node.js + Express REST API backend with full LUKS lifecycle management
- React 18+ SPA frontend with dark-mode developer UI
- SQLite metadata database living on the encrypted volume
- Real-time USB detection via WebSocket
- Environment variable CRUD with redaction, metadata, and auto-generated `.env` files
- SKILL.md registry with YAML frontmatter parsing, validation, and OpenClaw path integration
- Auto-generated `sub-README.md` for each registered service
- Session-based authentication (LUKS passphrase = credential)
- Export service for `.env` bundles, skill archives, and full vault backups
- Setup scripts, udev rules, and systemd service unit

### Out of Scope (Future Phases)
- Multi-user / RBAC (single-user local system by design)
- Cloud sync or remote access
- Mobile-native app
- Tauri/Electron desktop wrapper
- Automatic cloud backup (manual export only)

---

## 2. Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER (React SPA)                     │
│  /login  /dashboard  /env-vars  /services  /skills  /settings│
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / WSS
┌──────────────────────────▼──────────────────────────────────┐
│              NODE.JS + EXPRESS BACKEND                       │
│  Auth  LUKS  EnvVar  Skills  Services  Files  Export        │
│  Middleware: helmet, rate-limit, csrf, session               │
└──────────────────────────┬──────────────────────────────────┘
                           │ child_process.spawn()
┌──────────────────────────▼──────────────────────────────────┐
│              SYSTEM LAYER (Raspberry Pi OS)                  │
│  cryptsetup  udev  mount/umount  dm-crypt  systemd          │
└──────────────────────────┬──────────────────────────────────┘
                           │ block I/O
┌──────────────────────────▼──────────────────────────────────┐
│           LUKS-ENCRYPTED USB 3.0 DRIVE (ext4)                │
│  vault.db  env/*.env  skills/*/SKILL.md  services/*/README  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema (SQLite)

```sql
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

-- Skills Registry
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  path VARCHAR(512) NOT NULL UNIQUE,
  frontmatter TEXT,        -- raw YAML frontmatter
  metadata TEXT,           -- parsed JSON from metadata.openclaw
  installed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Services
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(128) NOT NULL UNIQUE,
  description TEXT,
  swagger_url VARCHAR(512),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Activity Log
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(64),   -- env_var, skill, service, vault
  target_id INTEGER,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  data TEXT,
  expires_at DATETIME NOT NULL
);
```

---

## 4. API Specification

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Submit passphrase, unlock vault, create session |
| POST | `/api/auth/logout` | Destroy session, optionally lock vault |
| GET | `/api/auth/status` | Returns `{ authenticated: bool, vaultMounted: bool }` |

### LUKS Management
| Method | Endpoint | Body / Query | Description |
|--------|----------|--------------|-------------|
| POST | `/api/luks/create` | `{ passphrase }` | Format new LUKS2 volume |
| POST | `/api/luks/unlock` | `{ passphrase }` | Unlock + mount vault |
| POST | `/api/luks/lock` | — | Unmount + close vault |
| GET | `/api/luks/status` | — | Full vault status |
| POST | `/api/luks/keyslot` | `{ action, oldPass, newPass, slotIndex }` | Manage key slots |
| POST | `/api/luks/backup-header` | `{ outputPath }` | Backup LUKS header |

### Environment Variables
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/env` | — | List all env vars (values redacted) |
| GET | `/api/env/:id` | — | Get single env var |
| POST | `/api/env` | `{ name, value, ... }` | Create |
| PUT | `/api/env/:id` | `{ name, value, ... }` | Update |
| DELETE | `/api/env/:id` | — | Delete |
| POST | `/api/env/bulk-delete` | `{ ids: [] }` | Bulk delete |
| POST | `/api/env/export` | `{ ids?, format, service_name? }` | Export `.env` or JSON |

### Skills
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/skills` | — | List all scanned skills |
| GET | `/api/skills/:id` | — | Get skill detail with Markdown preview |
| POST | `/api/skills/scan` | — | Rescan vault skills/ directory |
| POST | `/api/skills` | `{ name, content }` | Create new SKILL.md |
| PUT | `/api/skills/:id` | `{ content }` | Update SKILL.md |
| POST | `/api/skills/:id/install` | — | Copy/symlink to `~/.openclaw/skills/` |
| POST | `/api/skills/:id/uninstall` | — | Remove from OpenClaw path |

### Services & README
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/services` | — | List services |
| POST | `/api/services` | `{ name, description, swagger_url }` | Create service |
| PUT | `/api/services/:id` | `{ name, description, swagger_url }` | Update service |
| DELETE | `/api/services/:id` | — | Delete service |
| POST | `/api/services/:id/readme` | — | Generate README.md for service |

### Files
| Method | Endpoint | Query | Description |
|--------|----------|-------|-------------|
| GET | `/api/files/read` | `?path=...` | Read file from vault |
| POST | `/api/files/write` | `{ path, content }` | Write file to vault |
| DELETE | `/api/files/delete` | `?path=...` | Delete file from vault |
| GET | `/api/files/list` | `?dir=...` | List directory contents |
| GET | `/api/files/exists` | `?path=...` | Check if path exists |

### Export
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/export/dotenv` | `{ service_name? }` | Export `.env` file(s) |
| POST | `/api/export/skills` | `{ skill_ids? }` | Export skills ZIP |
| POST | `/api/export/full` | — | Export full vault ZIP |

### WebSocket
| Event | Direction | Payload |
|-------|-----------|---------|
| `usb-status` | Server → Client | `{ present: bool, serial: string }` |
| `vault-state` | Server → Client | `{ state: "locked"|"unlocked"|"mounted" }` |

---

## 5. UI/UX Specification

### Design Direction
- **Aesthetic**: Industrial/utilitarian dark theme — precision tools for infrastructure developers
- **Typography**: JetBrains Mono (code/values) + DM Sans (headings)
- **Color Palette**:
  - Background: `#0a0a0f` (near-black with subtle blue undertone)
  - Surface: `#14141b`
  - Primary accent: `#00d4aa` (teal)
  - Danger accent: `#ff4d4d` (red)
  - Text primary: `#e8e8ef`
  - Text secondary: `#6b6b78`
- **Motion**: Subtle fade/slide transitions
- **Layout**: Sidebar navigation on desktop; bottom tab bar on narrow viewports

### Key Views (All Implemented)
1. **Login View** — Large passphrase input centered; vault status indicator; USB presence badge
2. **Dashboard** — Status cards (vault state, USB serial, session timeout), recent activity log
3. **Env Var Table** — Sortable columns, redacted values with eye-icon reveal, bulk-select, search/filter
4. **Env Var Modal** — Form with fields + service/skill dropdowns; live `.env` preview
5. **Skill Registry** — Card grid with YAML frontmatter; Markdown preview with syntax highlighting
6. **Service Management** — Service cards with linked env var count; generated README preview
7. **Settings** — Lock vault, keyslot management, header backup, device info

---

## 6. Security Requirements (All Implemented)

| Requirement | Implementation |
|-------------|---------------|
| Secure cookies | `HttpOnly`, `Secure`, `SameSite=Strict` |
| Session timeout | 30 min idle expiry; server-side session store |
| Rate limiting | 5 login attempts / min; 100 API calls / min |
| Input sanitization | Express-validator patterns + path traversal guards |
| CSP headers | Strict Content-Security-Policy via Helmet |
| Passphrase handling | Piped to cryptsetup stdin; never logged; pino redaction |
| Process isolation | Dedicated `openclaw-vault` OS user; restricted sudoers |
| USB binding | udev rule matches specific USB serial number |
| File path traversal | All file operations validated against mount point prefix |

---

## 7. Development Phases (Complete)

### Phase 0: Project Scaffold & Tooling ✅
- Monorepo with `backend/` and `frontend/`
- Vite, React, Tailwind, Express configured
- Base folder structure created

### Phase 1: Database & Configuration Layer ✅
- `backend/db/connection.js` with `better-sqlite3`
- `backend/db/schema.sql` and migration runner
- `backend/config/index.js` with env overrides

### Phase 2: LUKS Backend Core ✅
- `luksManager.js`: format, unlock, lock, mount, keyslot add/remove, header backup
- `/api/luks/*` routes with robust error handling

### Phase 3: Auth & Session Management ✅
- SQLite session store
- `/api/auth/login` (passphrase → cryptsetup → session)
- `/api/auth/logout` and `/api/auth/status`
- `requireAuth` middleware protecting all non-auth routes
- Helmet, rate-limit, secure cookies

### Phase 4: USB Monitor & WebSocket ✅
- `usbMonitor.js` using `udevadm monitor` + polling fallback
- WebSocket server emitting `usb-status` and `vault-state`
- `useVaultStatus` hook on frontend
- Real-time status on LoginView and Dashboard

### Phase 5: Environment Variable Dashboard ✅
- `/api/env/*` CRUD routes with SQLite + `.env` file sync
- Frontend: `EnvVarTable`, `EnvVarModal`, redaction toggle
- Auto-generate `.env` files on create/update/delete
- Bulk operations + export (dotenv + JSON)

### Phase 6: Skill Registry & Scanner ✅
- `skillScanner.js`: recursive scan, YAML frontmatter extraction, validation
- `/api/skills/*` routes
- Frontend: `SkillRegistry`, Markdown preview, install/uninstall to `~/.openclaw/skills/`

### Phase 7: Service Management & README Generator ✅
- `/api/services/*` routes
- `readmeGenerator.js` template engine
- Frontend: `ServiceCard`, detail modal, README generation

### Phase 8: UI Polish, Export & Settings ✅
- `/api/export/*` routes (dotenv, skills ZIP, full vault ZIP)
- `SettingsView`: lock vault, keyslot management, header backup
- Dark mode theming, responsive layout, keyboard-friendly forms

### Phase 9: Deployment & DevOps ✅
- `bin/setup.sh` (system deps, Node.js, user creation, sudoers, systemd)
- `bin/usb-inserted.sh` trigger script
- `systemd/openclaw-vault.service` with security hardening
- `bin/backup.sh` utility

---

## 8. Testing Plan

### Unit Tests
- **Backend**: Jest + Supertest for API routes; mock `child_process` for LUKS ops
- **Frontend**: Vitest + React Testing Library for components

### Integration Tests
- Playwright E2E: full user journey
  1. Login → unlock vault
  2. Create env var → verify `.env` file written
  3. Create skill → verify scanned in registry
  4. Generate README → verify file exists
  5. Lock vault → return to login

### Security Tests
- Rate limit enforcement
- Session expiry and invalidation
- Path traversal attempts on `/api/files/*`
- Passphrase never appears in logs

---

## 9. Deployment Plan

### Target Environment
- Raspberry Pi 5 with Raspberry Pi OS (64-bit Bookworm)
- USB 3.0 drive (16 GB minimum)

### Installation Steps
1. Run `sudo bash bin/setup.sh`
2. Update `LUKS_DEVICE_PATH` in `/opt/openclaw-vault/backend/.env`
3. Start service: `sudo systemctl start openclaw-vault`
4. Navigate to `http://localhost:3001`

### Backup & Recovery
- **Full backup**: `sudo dd if=/dev/sdX of=backup.img bs=4M`
- **Incremental**: Use built-in Export ZIP feature
- **Header backup**: `cryptsetup luksHeaderBackup` via Settings UI

---

## 10. Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| cryptsetup privilege escalation | Critical | Restrict sudoers to exact commands |
| Passphrase memory leak | High | Pipe to stdin, pino redaction, avoid closures |
| Frontend path traversal | High | Enforce mount point prefix; reject `..` segments |
| Session fixation | Medium | Regenerate session on login; strict expiry |
| SQLite corruption | Medium | WAL mode + periodic backups |
| LUKS header corruption | High | Mandatory header backup after format; store offline |

---

## 11. Success Criteria

- [x] Vault can be created, unlocked, and locked via web UI
- [x] Environment variables are persisted to SQLite and `.env` files simultaneously
- [x] SKILL.md files are scanned, parsed, and linkable from env var editor
- [x] Auto-generated README.md contains correct env var tables and skill references
- [x] USB insertion/removal is reflected in UI within 2 seconds
- [x] Locking vault returns UI to login screen and prevents file access
- [x] Export produces valid `.env` and ZIP archives
- [x] All security patterns implemented (rate limits, secure cookies, path traversal guards)
- [x] Application deployable via systemd with automated setup script
- [x] Setup script completes on fresh Pi OS install without manual intervention (except serial number)
