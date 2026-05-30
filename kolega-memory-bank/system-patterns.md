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
- **vaultPaths.js**: Central path resolver for cross-platform mount-point resolution
- **usbMonitor.js**: udev event listener (Linux); delegates to `VaultProvider.detectDevices()` on macOS/Windows
- **fileManager.js**: Safe file operations on mounted vault
- **readmeGenerator.js**: README.md template engine
- **skillScanner.js**: SKILL.md discovery & YAML frontmatter parser

## Secret Server (Pi5 / Tailscale)
When the VeraCrypt USB is plugged into a Raspberry Pi 5, a dedicated FastAPI service serves approved secrets and signing operations to authorized Tailscale peers only.

### Architecture
- **Tailscale-only binding** — `get_tailscale_ip()` scans interfaces for `100.x.x.x`; the server refuses to start if none is found.
- **Vault guard** — `vault/guard.py` provides `require_vault_mounted()` dependency; all secret endpoints return `503` if the vault is unmounted.
- **Profile-based ACLs** — `auth/client_auth.py` validates `X-API-Key` headers against `config/auth/profiles.json` inside the vault.
- **Tiered secret delivery**:
  - **Tier 3 (SKILL.md)** — read from disk, returned as plain text.
  - **Tier 2 (runtime-env)** — `.env` files parsed and returned as JSON; client stores in RAM only.
  - **Tier 1 (signing)** — private keys never leave the Pi; client sends `payload_hash`, server returns `signature`.

### Deployment & Startup Order
Systemd enforces the following boot sequence on the Pi5:
```
tailscaled.service
      ↓
openclaw-vault.service   (Node.js backend, V2 VeraCrypt-aware)
      ↓
secret-server.service    (FastAPI, ExecStartPost health-check.py)
      ↓
signing-agent.service    (isolated signing subprocess, mlock)
```
- `openclaw-vault.service` sets `VAULT_PROVIDER=veracrypt` and `VAULT_MOUNT_POINT=/mnt/securevault`.
- `secret-server.service` has `Before=signing-agent.service` and `ExecStartPost=/opt/secret-server/venv/bin/python /opt/secret-server/deploy/health-check.py`.
- `signing-agent.service` has `After=secret-server.service` and `Requires=openclaw-vault.service`.
- The health-check script polls `GET /health` for up to 10 seconds; if it fails, systemd marks the unit as failed.

### Modules
| Module | Responsibility | Key Endpoints |
|--------|---------------|---------------|
| Health | Status, vault mount state, Tailscale IP | GET /health |
| Vault API | Mount status and manifest | GET /vault/status |
| Skills API | List and read SKILL.md files | GET /skills, /skills/{tool}/{file} |
| Secrets API | Profile listing and runtime env | GET /profiles, POST /secrets/runtime-env |
| Signing API | Hash-in, signature-out (proxies to signing agent) | POST /sign/polymarket, POST /sign/{key_id} |
| Signing Agent | Restricted subprocess, mlock, Unix socket | Internal JSON-over-socket protocol |
| Admin API | Reload vault profiles/config | POST /admin/reload |

### Security Patterns (Secret Server)
- No CORS — Tailscale is the network layer.
- Structured logging via `structlog` — passwords and secrets are never logged.
- VeraCrypt password passed via `stdin` only (`subprocess.Popen` with `stdin=PIPE`); never via CLI args.
- Private keys loaded from `<mount>/crypto/` and cleared from memory after signing.
- **Signing Agent isolation** — `signing/agent_service.py` runs as a separate restricted subprocess communicating over a Unix domain socket. It enforces `mlock` on key material (best-effort) and runs under a dedicated `signingagent` user with stricter systemd hardening than the main server.
- Per-client rate limiting on signing endpoints (default 10 req/min).
- Every signing request is audited to `<mount>/audit/signing.log`.
- systemd hardening: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, `MemoryDenyWriteExecute`, `AmbientCapabilities=CAP_IPC_LOCK` (signing agent).

## VaultProvider Pattern
- Routes and middleware consume `VaultProviderFactory.getProvider()` — never import `luksManager.js` directly.
- `mountVault(devicePath, mountPoint, password)` unlocks + mounts via stdin password passing.
- `unmountVault(mountPoint)` dismounts + locks safely (busy-file detection).
- Shared filesystem helpers (`validateVaultStructure`, `readVaultManifest`, `listSecrets`, `listSkills`) live in the abstract base class.

## vaultPaths Pattern
- All vault file paths are resolved through `backend/services/vaultPaths.js` rather than hardcoded `config.luks.mountPoint`.
- `getMountPoint()` priority: `config.vault.mountPoint` → `config.luks.mountPoint` → platform default (`platforms.js`).
- `resolveVaultPath(relativePath)` enforces traversal guards against the active mount point.
- `normalizeStoredPath(storedPath, dirKey)` converts legacy V1 absolute paths to relative paths for cross-platform portability.
- Skills database stores **relative** paths so they remain valid when the vault is mounted on Linux (`/mnt/securevault`), macOS (`/Volumes/SecureVault`), or Windows (`S:`).

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

## Testing Patterns
- **Backend tests** use Node.js built-in test runner (`node --test`).
- **In-memory SQLite** (`:memory:`) initialized via `test/helpers/test-setup.js` for isolated DB tests.
- **Provider tests** mock internal `_exec` / `_spawnVc` methods to avoid spawning real cryptsetup/veracrypt binaries.
- **Security tests** spawn real subprocesses and inspect `/proc/<pid>/cmdline` to verify passwords never appear in process listings.
- **Integration tests** exercise the full mount → validate → read → unmount cycle with temporary directories.
- **Secret Server tests** use `pytest` + `FastAPI TestClient` with monkeypatched settings and temporary vault directories.

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
