# OpenClaw Secure Vault — Functional Implementation Plan

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
CREATE TABLE env_vars (
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
CREATE TABLE skills (
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
CREATE TABLE services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(128) NOT NULL UNIQUE,
  description TEXT,
  swagger_url VARCHAR(512),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Activity Log
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(64),   -- env_var, skill, service, vault
  target_id INTEGER,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions
CREATE TABLE sessions (
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
| POST | `/api/luks/create` | `{ device, passphrase }` | Format new LUKS2 volume |
| POST | `/api/luks/unlock` | `{ passphrase }` | Unlock + mount vault |
| POST | `/api/luks/lock` | — | Unmount + close vault |
| GET | `/api/luks/status` | — | `{ state: "locked"|"unlocked"|"mounted" }` |
| POST | `/api/luks/keyslot` | `{ action: "add"|"remove", oldPass, newPass }` | Manage key slots |

### Environment Variables
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/env` | — | List all env vars (values redacted) |
| GET | `/api/env/:id` | — | Get single env var (value revealed if authenticated) |
| POST | `/api/env` | `{ name, value, description, service_name, api_docs_url, skill_id }` | Create |
| PUT | `/api/env/:id` | `{ name, value, description, service_name, api_docs_url, skill_id }` | Update |
| DELETE | `/api/env/:id` | — | Delete |
| POST | `/api/env/bulk-delete` | `{ ids: [] }` | Bulk delete |
| POST | `/api/env/export` | `{ ids?: [], format: "dotenv"|"json" }` | Export selected or all |

### Skills
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/skills` | — | List all scanned skills |
| GET | `/api/skills/:id` | — | Get skill detail with Markdown preview |
| POST | `/api/skills/scan` | — | Rescan vault skills/ directory |
| POST | `/api/skills` | `{ name, description, content }` | Create new SKILL.md |
| PUT | `/api/skills/:id` | `{ content }` | Update SKILL.md |
| POST | `/api/skills/:id/install` | — | Copy/symlink to `~/.openclaw/skills/` |
| POST | `/api/skills/:id/uninstall` | — | Remove from OpenClaw path |

### Services & README
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/services` | — | List services |
| POST | `/api/services` | `{ name, description, swagger_url }` | Create service |
| PUT | `/api/services/:id` | `{ name, description, swagger_url }` | Update service |
| POST | `/api/readme/generate` | `{ service_id }` | Generate README.md for service |

### Files
| Method | Endpoint | Query | Description |
|--------|----------|-------|-------------|
| GET | `/api/files/read` | `?path=...` | Read file from vault |
| POST | `/api/files/write` | `{ path, content }` | Write file to vault |
| GET | `/api/files/list` | `?dir=...` | List directory contents |

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
| `activity` | Server → Client | `{ action, target, timestamp }` |

---

## 5. UI/UX Specification

### Design Direction
- **Aesthetic**: Industrial/utilitarian dark theme — precision tools for infrastructure developers
- **Typography**: Distinctive monospaced body font (e.g., JetBrains Mono or Fira Code) for all code/values; a refined sans-serif (e.g., Space Grotesk is too common — use something like DM Sans or Sora) for headings
- **Color Palette**:
  - Background: `#0a0a0f` (near-black with subtle blue undertone)
  - Surface: `#14141b`
  - Primary accent: `#00d4aa` (teal — success/encryption)
  - Danger accent: `#ff4d4d` (red — delete/lock/warning)
  - Text primary: `#e8e8ef`
  - Text secondary: `#6b6b78`
- **Motion**: Subtle fade/slide transitions; no heavy animation — this is a security tool
- **Layout**: Sidebar navigation on desktop; bottom tab bar on narrow viewports

### Key Views
1. **Login View**: Large passphrase input centered; vault status indicator (locked/unlocked/mounted); USB presence badge
2. **Dashboard**: Status cards (vault state, USB serial, session timeout), recent activity log, quick-action buttons (Lock Vault, Add Variable, Scan Skills)
3. **Env Var Table**: Sortable columns, redacted values with eye-icon reveal toggle, bulk-select checkboxes, search/filter bar
4. **Env Var Modal**: Form with fields (name, value, description, service dropdown, API docs URL, skill dropdown); live `.env` preview
5. **Skill Registry**: Card grid or list; each card shows YAML frontmatter name/description; click to expand Markdown preview with syntax highlighting
6. **Service Management**: Service cards with linked env var count, associated skill, generated README preview
7. **Settings**: Mount path config, session timeout slider, udev rule display, backup/restore actions

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl + N` | New environment variable |
| `Ctrl + S` | Save current form |
| `Ctrl + L` | Lock vault (with confirmation) |
| `Ctrl + K` | Focus search bar |
| `Esc` | Close modal |

---

## 6. Security Requirements

| Requirement | Implementation |
|-------------|---------------|
| HTTPS only | Self-signed TLS cert for localhost; reject HTTP |
| Secure cookies | `HttpOnly`, `Secure`, `SameSite=Strict` |
| Session timeout | 30 min idle expiry; server-side session store |
| Rate limiting | 5 login attempts / min; 100 API calls / min |
| Input sanitization | Express-validator + DOMPurify for Markdown |
| CSP headers | Strict Content-Security-Policy via Helmet |
| CSRF protection | Double-submit cookie pattern |
| Passphrase handling | Piped to cryptsetup stdin; never logged; cleared from memory immediately |
| Process isolation | Dedicated `openclaw-vault` OS user; sudoers restricted to `/sbin/cryptsetup`, `/bin/mount`, `/bin/umount` |
| USB binding | udev rule matches specific USB serial number; generic drives ignored |
| File path traversal | All file operations validated against `/mnt/openclaw-vault` prefix only |

---

## 7. Development Phases

### Phase 0: Project Scaffold & Tooling (0.5 day)
- Initialize monorepo with `backend/` and `frontend/`
- Configure Vite, React, Tailwind, Express
- Set up `package.json` with all dependencies
- Create base folder structure per tech-context.md
- Configure ESLint, Prettier

### Phase 1: Database & Configuration Layer (0.5 day)
- Implement `backend/db/connection.js` with `better-sqlite3`
- Create `backend/db/schema.sql` and migration runner
- Implement `backend/config/default.json` with mount paths, timeouts, defaults
- Build configuration loader with environment overrides

### Phase 2: LUKS Backend Core (1–1.5 days)
- Build `luksManager.js` service:
  - `formatDevice(device, passphrase)`
  - `unlockDevice(device, passphrase, mapperName)`
  - `lockDevice(mapperName)`
  - `getStatus(mapperName)`
  - `addKeySlot(device, oldPass, newPass)`
  - `removeKeySlot(device, passphrase)`
- Implement `/api/luks/*` routes with robust error handling
- Write shell tests for LUKS operations using loopback devices

### Phase 3: Auth & Session Management (0.5 day)
- Build session store using SQLite
- Implement `/api/auth/login` (passphrase → cryptsetup test → session)
- Implement `/api/auth/logout` and `/api/auth/status`
- Add `authMiddleware` to protect all non-auth routes
- Integrate Helmet, rate-limit, CSRF middleware

### Phase 4: USB Monitor & WebSocket (0.5 day)
- Build `usbMonitor.js` using `udevadm monitor` child process
- Emit `usb-status` events via WebSocket
- Build `useVaultStatus` hook on frontend
- Display real-time USB presence + vault state on LoginView

### Phase 5: Environment Variable Dashboard (1.5–2 days)
- Implement `backend/services/fileManager.js` for safe file ops
- Build `/api/env/*` CRUD routes with SQLite + `.env` file sync
- Frontend: `EnvVarTable`, `EnvVarModal`, redaction toggle
- Auto-generate `.env` files on create/update/delete
- Bulk operations + export functionality

### Phase 6: Skill Registry & Scanner (1–1.5 days)
- Build `skillScanner.js`:
  - Recursive scan of `skills/` directory
  - YAML frontmatter extraction via `js-yaml`
  - Validation of required keys (`name`, `description`)
- Build `/api/skills/*` routes
- Frontend: `SkillRegistry`, `SkillDropdown`, Markdown preview with syntax highlighting
- Implement install/uninstall to `~/.openclaw/skills/`

### Phase 7: Service Management & README Generator (0.5–1 day)
- Build `/api/services/*` routes
- Build `readmeGenerator.js` template engine
- Frontend: `ServiceCard`, `ReadmePreview`
- Link services to env vars and skills

### Phase 8: UI Polish, Export & Settings (1 day)
- Implement `/api/export/*` routes
- Build `ExportPanel` component
- Implement `Settings` view
- Dark mode theming, keyboard shortcuts, accessibility audit
- Responsive layout refinements

### Phase 9: Deployment & DevOps (0.5–1 day)
- Write `bin/setup.sh` (system deps, NodeSource, user creation, sudoers, udev, systemd)
- Write `bin/usb-inserted.sh` trigger script
- Write `systemd/openclaw-vault.service`
- Create `bin/backup.sh` utility
- End-to-end testing on representative environment
- Documentation: `INSTALL.md`, `USAGE.md`

**Total Estimated Effort: ~8–11 days**

---

## 8. Testing Plan

### Unit Tests
- **Backend**: Jest + Supertest for all API routes; mock `child_process` for LUKS ops
- **Frontend**: Vitest + React Testing Library for components and hooks
- **Services**: Isolate `luksManager`, `skillScanner`, `readmeGenerator` with test fixtures

### Integration Tests
- Playwright E2E: full user journey
  1. Login → unlock vault
  2. Create env var → verify `.env` file written
  3. Create skill → verify scanned in registry
  4. Generate README → verify file exists
  5. Lock vault → return to login

### Security Tests
- Rate limit enforcement
- CSRF token validation
- Session expiry and invalidation
- Path traversal attempts on `/api/files/*`
- Passphrase never appears in logs or process list

### Performance Targets
- Dashboard load: < 2s
- Env var CRUD: < 100ms
- Skill scan (100 skills): < 500ms
- Vault unlock-to-ready: < 3s

---

## 9. Deployment Plan

### Target Environment
- Raspberry Pi 5 with Raspberry Pi OS (64-bit Bookworm)
- USB 3.0 drive (16 GB minimum)

### Installation Steps
1. Run `bin/setup.sh` as root:
   - Install `cryptsetup`, `cryptsetup-bin`, `udisks2`
   - Install Node.js 20.x via NodeSource
   - Create `openclaw-vault` service user
   - Configure sudoers for cryptsetup/mount/umount
   - Install udev rule (user must update serial number)
   - Install systemd service
   - Build frontend
   - Create mount point `/mnt/openclaw-vault`
2. Reboot or start service: `sudo systemctl start openclaw-vault`
3. Navigate to `https://localhost:3443`
4. Run LUKS Volume Creation Wizard (first-time setup)

### Backup & Recovery
- **Full backup**: `sudo dd if=/dev/sdX of=backup.img bs=4M`
- **Incremental**: Use built-in Export ZIP feature
- **Header backup**: `cryptsetup luksHeaderBackup` after format
- **Recovery key**: Store in additional LUKS key slot during setup

---

## 10. Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| cryptsetup privilege escalation | Critical | Restrict sudoers to exact commands; validate all device paths against known block devices |
| Passphrase memory leak | High | Pipe to stdin, clear buffers, avoid string retention in closures |
| USB serial spoofing | Medium | Match serial + vendor ID + model; warn user on mismatch |
| Frontend path traversal via file API | High | Enforce `/mnt/openclaw-vault` prefix; reject `..` segments |
| Session fixation | Medium | Regenerate session ID on login; strict expiry |
| SQLite corruption on power loss | Medium | WAL mode + periodic backups; ext4 journaling |
| Dependency vulnerabilities | Medium | `npm audit` in CI; minimal dependency footprint |
| LUKS header corruption | High | Mandatory header backup after format; store offline |

---

## 11. Success Criteria

- [ ] Vault can be created, unlocked, and locked via web UI
- [ ] Environment variables are persisted to SQLite and `.env` files simultaneously
- [ ] SKILL.md files are scanned, parsed, and linkable from env var editor
- [ ] Auto-generated README.md contains correct env var tables and skill references
- [ ] USB insertion/removal is reflected in UI within 2 seconds
- [ ] Locking vault returns UI to login screen and prevents file access
- [ ] Export produces valid `.env` and ZIP archives
- [ ] All security tests pass (rate limits, CSRF, session expiry, path traversal)
- [ ] Application starts automatically via systemd after Pi reboot
- [ ] Setup script completes on fresh Pi OS install without manual intervention (except serial number)
