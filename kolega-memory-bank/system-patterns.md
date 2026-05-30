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
| Vault Controller | Volume create/unlock/lock/status | POST /api/vault/* (/api/luks/* deprecated) |
| USB Monitor | Detect insertion/removal | WebSocket /ws/usb-status |
| Env Var API | CRUD for environment variables | GET/POST/PUT/DELETE /api/env |
| File Manager | Read/write .env, SKILL.md, README | GET/POST /api/files/* |
| Skill Registry | Scan, list, register, link skills | GET/POST/PUT /api/skills |
| README Generator | Auto-generate service docs | POST /api/readme/generate |
| Export Service | Export .env, bundles, archives | POST /api/export/* |

## Key Services (Backend)
- **VaultProvider** (`backend/services/VaultProvider.js`): Abstract base class defining the provider contract
- **VaultProviderFactory** (`backend/services/VaultProviderFactory.js`): Returns `LuksProvider` or `VeraCryptProvider` based on config/env
- **LuksProvider** (`backend/services/providers/LuksProvider.js`): LUKS/cryptsetup adapter (legacy)
- **VeraCryptProvider** (`backend/services/providers/VeraCryptProvider.js`): VeraCrypt CLI adapter (cross-platform)
- **usbMonitor.js**: udev event listener
- **fileManager.js**: Safe file operations on mounted vault
- **readmeGenerator.js**: README.md template engine
- **skillScanner.js**: SKILL.md discovery & YAML frontmatter parser

## VaultProvider Pattern
- Routes and middleware consume `VaultProviderFactory.getProvider()` — never import `luksManager.js` directly.
- `mountVault(devicePath, mountPoint, password)` unlocks + mounts via stdin password passing.
- `unmountVault(mountPoint)` dismounts + locks safely (busy-file detection).
- Shared filesystem helpers (`validateVaultStructure`, `readVaultManifest`, `listSecrets`, `listSkills`) live in the abstract base class.

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

## Migration Pattern (One-Time)
- `bin/migrate-luks-to-veracrypt.sh` performs a fully automated LUKS → VeraCrypt migration:
  1. Mounts the source LUKS volume.
  2. Copies all data to a temporary secure backup with SHA-256 verification.
  3. Creates a new VeraCrypt volume with an **exFAT** inner filesystem.
  4. Restores data into the canonical V2 directory structure (`config`, `secrets`, `skills`, `crypto`, `exports`, `audit`).
  5. Generates `vault-manifest.json`.
  6. Validates the restored vault via `VeraCryptProvider.validateVaultStructure` using `bin/validate-migration.mjs`.
  7. Prompts before deleting the temporary backup.
- Legacy directories are mapped automatically: `env/` → `secrets/`, `services/` → `config/`.
- Cross-platform validation (Linux, macOS, Windows) is required before the backup is deleted.

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
