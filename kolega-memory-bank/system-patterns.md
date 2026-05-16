# System Patterns

## Architecture Layers
1. **Hardware Layer**: Raspberry Pi 5, USB 3.0 drive
2. **Kernel & System Layer**: Linux kernel, cryptsetup, udev, systemd, dm-crypt
3. **Backend Layer**: Node.js + Express REST API
4. **Frontend Layer**: React 18+ SPA (Vite)
5. **Data Layer**: SQLite (metadata) + ext4 filesystem (encrypted content)

## Backend Modules
| Module | Responsibility | Key Endpoints |
|--------|---------------|---------------|
| Auth | Session-based login, timeout, CSRF | POST /api/auth/login, logout |
| LUKS Controller | Volume create/unlock/lock/status | POST /api/luks/* |
| USB Monitor | Detect insertion/removal | WebSocket /ws/usb-status |
| Env Var API | CRUD for environment variables | GET/POST/PUT/DELETE /api/env |
| File Manager | Read/write .env, SKILL.md, README | GET/POST /api/files/* |
| Skill Registry | Scan, list, register, link skills | GET/POST/PUT /api/skills |
| README Generator | Auto-generate service docs | POST /api/readme/generate |
| Export Service | Export .env, bundles, archives | POST /api/export/* |

## Key Services (Backend)
- **luksManager.js**: cryptsetup wrapper via `child_process.spawn()`
- **usbMonitor.js**: udev event listener
- **fileManager.js**: Safe file operations on mounted vault
- **readmeGenerator.js**: README.md template engine
- **skillScanner.js**: SKILL.md discovery & YAML frontmatter parser

## Authentication Pattern
- Session-based (not JWT) — stateful local system
- LUKS passphrase is the sole credential
- Session cookie: HttpOnly, Secure, SameSite=Strict
- Default timeout: 30 minutes of inactivity
- Locking vault invalidates all sessions

## Data Flow Lifecycle
1. **USB Detection**: udev rule triggers on device insert
2. **Unlock**: User enters passphrase → `cryptsetup luksOpen` → mount
3. **Access**: Full CRUD operations via React UI
4. **Lock**: `umount` → `cryptsetup luksClose` → return to login

## Security Patterns
- Passphrase piped to cryptsetup stdin (never shell-interpolated)
- Passphrase cleared from memory immediately after unlock
- Dedicated service user with sudoers restricted to cryptsetup/mount
- udev rule matches specific USB serial number
- Rate limiting + bcrypt for any application-level auth
- Helmet.js + CSP + CSRF tokens

## Frontend Routing
| Route | Purpose |
|-------|---------|
| /login | Authenticate to unlock |
| /dashboard | System overview |
| /env-vars | Full CRUD for environment variables |
| /services | API service registry |
| /skills | SKILL.md library management |
| /settings | Admin configuration |
