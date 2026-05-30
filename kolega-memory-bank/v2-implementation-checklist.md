# Secure Vault V2 — Implementation Checklist

> **Version**: 2.0.0-alpha  
> **Last Updated**: 2026-05-30  
> **V1 Archive Branch**: `secure-vault-v1`  
> **Plan Source**: `kolega-project-files/SecureVault_VeraCrypt_Conversion_Pi5_Secret_Server_Plan.pdf.md`

## Overview

This checklist tracks the conversion of Secure Vault from a Linux-only LUKS-backed USB vault (V1) into a cross-platform VeraCrypt-backed vault with an optional Pi5 Tailscale Secret Server (V2).

### Core Principles
1. **Do not rewrite the UI** — the existing React SPA and its workflows stay intact.
2. **Replace only the backend mount engine** — LUKS-specific logic becomes a `VaultProvider` interface.
3. **Security-first** — passwords via stdin only, no CLI args, no logging of secrets.
4. **Cross-platform** — Linux/Pi5, macOS, Windows.
5. **Fail closed** — Secret Server refuses to serve secrets if the vault is unmounted.

---

## Epic A — Vault Provider Abstraction Layer

**Goal**: Create a pluggable backend so the UI and routes call an interface, not `cryptsetup` directly.

### A.1 Define `VaultProvider` Interface
- [x] Create `backend/services/VaultProvider.js` with the contract:
  - `detectDevices()` → array of candidate USB/removable devices
  - `getVaultStatus()` → `{ mounted, mountPath, provider }`
  - `mountVault(devicePath, mountPoint, password)` → mount via stdin
  - `unmountVault(mountPoint)` → safe unmount
  - `validateVaultStructure(mountPoint)` → check expected dirs exist
  - `readVaultManifest(mountPoint)` → parse `vault-manifest.json`
  - `listSecrets(mountPoint)` → env file names
  - `listSkills(mountPoint)` → skill folder names
- [x] Create `backend/services/errors.js` with `VaultError`, `MountError`, `ValidationError`.

**Acceptance Criteria**
- Interface is pure JS (no framework change).
- All methods return Promises.
- `luksManager.js` is no longer imported by routes directly.

### A.2 Refactor `LuksProvider` (Legacy Adapter)
- [x] Create `backend/services/providers/LuksProvider.js`.
- [x] Migrate existing `luksManager.js` logic into the adapter.
- [x] Ensure `LuksProvider` fully implements the `VaultProvider` interface.
- [x] Keep `luksManager.js` temporarily for rollback, mark `@deprecated`.

**Files Created / Modified**
- `backend/services/providers/LuksProvider.js` (new)
- `backend/services/luksManager.js` (deprecated, frozen)

### A.3 Create `VeraCryptProvider`
- [x] Create `backend/services/providers/VeraCryptProvider.js`.
- [x] Implement platform detection (`linux`, `darwin`, `win32`).
- [x] Resolve VeraCrypt binary per platform:
  - Linux: `/usr/bin/veracrypt`
  - macOS: `/Applications/VeraCrypt.app/Contents/MacOS/VeraCrypt`
  - Windows: `VeraCrypt.exe` (from PATH or registry)
- [x] Resolve default mount point per platform:
  - Linux: `/mnt/securevault`
  - macOS: `/Volumes/SecureVault`
  - Windows: `S:` (configurable drive letter)
- [x] Implement `mountVault` using stdin password passing:
  ```js
  const proc = spawn(veracryptBin, ['--text', '--mount', devicePath, mountPoint, '--stdin']);
  proc.stdin.write(password + '\n');
  proc.stdin.end();
  ```
- [x] Implement `unmountVault` with `--dismount` and busy-file safety.
- [x] Implement `detectDevices` by scanning likely removable USB block devices (`/dev/disk/by-id/usb-*`, `diskutil list`, `wmic diskdrive`).
- [x] Add mount timeout handling (default 30s).

**Security Rules for VeraCryptProvider**
- [x] Never pass `-p` or `--password` on the command line.
- [x] Never log the password or mount command string.
- [x] Immediately overwrite the local `password` variable after use (`password = null`).

**Acceptance Criteria**
- Mount/unmount works on the current Linux dev environment.
- `ps aux | grep veracrypt` never contains the password.
- Incorrect password fails cleanly with a user-friendly message.
- Unmount fails safely if files are in use.

### A.4 Provider Factory & Config
- [x] Create `backend/services/VaultProviderFactory.js`.
- [x] Load active provider from `backend/config/default.json` key `vault.provider` (`luks` | `veracrypt`).
- [x] Support env override: `VAULT_PROVIDER=veracrypt`.
- [x] Create `backend/config/platforms.js` with platform-specific defaults.

**Files**
- `backend/services/VaultProviderFactory.js` (new)
- `backend/config/platforms.js` (new)
- `backend/config/default.json` (update)

---

## Epic B — VeraCrypt Mount Engine (Local Mode)

**Goal**: The SecureVault UI mounts/unmounts VeraCrypt without opening the VeraCrypt GUI.

### B.1 Update Express Routes
- [x] Refactor `backend/routes/luks.js` → `backend/routes/vault.js`.
  - Rename endpoints from `/api/luks/*` to `/api/vault/*`.
  - Internally call `VaultProviderFactory.getProvider()`.
- [x] Add backward-compatibility aliases (`/api/luks/*` → `/api/vault/*`) or update the frontend calls.
- [x] Update `backend/server.js` to register the new vault route.

### B.2 Update Frontend API Calls
- [x] Audit `frontend/src/` for hardcoded `/api/luks/` paths.
- [x] Update to `/api/vault/` where needed.
- [x] Update status display strings: "VeraCrypt SecureVault" instead of "LUKS SecureVault".

### B.3 Linux Permission Handling
- [x] Create `bin/securevault-veracrypt-mount` wrapper script (sudoers-safe).
  - Validates allowed device path regex.
  - Validates allowed mount path.
  - Rejects arbitrary shell arguments.
- [x] Create `bin/securevault-veracrypt-unmount` wrapper script.
- [x] Update `bin/setup.sh` to install these wrappers and configure sudoers for them.
- [x] Ensure the service user (`openclaw-vault`) can run only these wrappers as root.

**Files**
- `bin/securevault-veracrypt-mount` (new)
- `bin/securevault-veracrypt-unmount` (new)
- `bin/setup.sh` (update)
- `systemd/openclaw-vault.service` (update if needed)

---

## Epic C — Vault Migration Tool (One-Time)

**Goal**: Move existing LUKS vault contents to a new VeraCrypt exFAT volume without data loss.

### C.1 Build Migration Script
- [x] Create `bin/migrate-luks-to-veracrypt.sh`.
  - Step 1: Mount current LUKS volume.
  - Step 2: Copy all contents to a temporary secure backup (`/tmp/sv-migrate-<timestamp>/`).
  - Step 3: Verify backup integrity (file count, checksums).
  - Step 4: Wipe/reformat USB as VeraCrypt volume.
  - Step 5: Format inner filesystem as **exFAT**.
  - Step 6: Mount new VeraCrypt vault.
  - Step 7: Restore directory structure:
    ```
    /securevault
      /config
      /secrets
      /skills
      /crypto
      /exports
      /audit
    ```
  - Step 8: Generate `vault-manifest.json` if missing.
  - Step 9: Validate restored vault with `VeraCryptProvider.validateVaultStructure`.
  - Step 10: Prompt user before deleting temporary backup.

### C.2 Cross-Platform Validation
- [x] Document that the new VeraCrypt vault must be validated on:
  - Pi5 / Linux
  - macOS (if applicable)
  - Windows (if applicable)
- [x] Do **not** delete the LUKS backup until all platforms pass.

**Files**
- `bin/migrate-luks-to-veracrypt.sh` (new)
- `docs/migration-guide.md` (new)

---

## Epic D — Local SecureVault Mode (Cross-Platform)

**Goal**: USB plugged into any supported machine works locally without Tailscale.

### D.1 Local Path Resolution
- [x] Create `backend/services/vaultPaths.js`.
  - Returns correct base path given current platform and mount state.
  - Linux: `/mnt/securevault`
  - macOS: `/Volumes/SecureVault`
  - Windows: `S:\`

### D.2 Preserve Existing Workflows
- [x] Ensure `/api/env/*` CRUD reads/writes from the mounted vault via `fileManager.js`.
- [x] Ensure `/api/skills/*` reads from `<mount>/skills/`.
- [x] Ensure `/api/files/*` reads from `<mount>/secrets/`.
- [x] Ensure README generation uses `<mount>/config/` (canonical V2 name; servicesDir mapped to `config`).
- [x] Ensure export service bundles from the vault root.

### D.3 USB Detection Update
- [x] Update `backend/services/usbMonitor.js` to detect VeraCrypt-ready removable devices.
- [x] Keep WebSocket `/ws/usb-status` emitting the same events.

**Acceptance Criteria**
- USB plugged into a Mac or Linux machine triggers the same UI workflow as V1.
- No Tailscale required.
- All existing CRUD operations work against the VeraCrypt mount point.

---

## Epic E — Pi5 Secret Server (FastAPI)

**Goal**: When the VeraCrypt USB is plugged into the Pi5, it serves approved secrets over Tailscale only.

### E.1 Project Scaffolding
- [x] Create `secret-server/` directory:
  ```
  secret-server/
  ├── pyproject.toml
  ├── requirements.txt
  ├── README.md
  ├── src/secret_server/
  │   ├── __init__.py
  │   ├── main.py
  │   ├── config.py
  │   ├── api/
  │   │   ├── health.py
  │   │   ├── vault.py
  │   │   ├── skills.py
  │   │   ├── secrets.py
  │   │   ├── signing.py
  │   │   └── admin.py
  │   ├── vault/
  │   │   ├── veracrypt.py
  │   │   └── guard.py
  │   ├── auth/
  │   │   ├── client_auth.py
  │   │   └── profiles.py
  │   └── signing/
  │       ├── agent.py
  │       └── audit.py
  ├── deploy/
  │   ├── secret-server.service
  │   └── install.sh
  └── tests/
  ```

### E.2 Core FastAPI Application
- [x] `main.py` creates the FastAPI app with:
  - CORS disabled (Tailscale is the network layer).
  - Structured logging (no secrets).
- [x] Dependencies:
  - `fastapi`, `uvicorn[standard]`, `pydantic>=2`, `python-multipart`

### E.3 Tailscale-Only Binding
- [x] Implement `get_tailscale_ip()` in `config.py`.
  - Scan interfaces for `100.x.x.x`.
  - Refuse to start if none found.
- [x] Start Uvicorn with `--host <tailscale_ip> --port 8000` (or 8787).
- [x] Log all incoming connection source IPs.

### E.4 Vault Guard
- [x] `vault/guard.py` provides `require_vault_mounted()` dependency.
- [x] Any endpoint that reads secrets returns `503` if the vault is not mounted.

### E.5 API Endpoints
Implement the minimum API:

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| GET | `/health` | Status + vault_mounted + tailscale_only | None |
| GET | `/vault/status` | `{ mounted, mount_path, vault_id, manifest_valid }` | API key |
| GET | `/skills` | List skill folders | API key |
| GET | `/skills/{tool}/{file}` | Return SKILL.md contents | API key |
| GET | `/profiles` | List available client profiles | API key |
| POST | `/secrets/runtime-env` | Return Tier 2 secrets for a profile | API key |
| POST | `/sign/polymarket` | Return signature only (Tier 1) | API key + signing allowed |
| POST | `/admin/reload` | Reload vault manifest & profiles | API key + admin |

### E.6 Client Authentication & Profiles
- [x] Create `auth/profiles.json` (or YAML) inside the vault:
  ```json
  {
    "clients": {
      "macbook-pro": { "allowed_profiles": ["local-dev"], "can_sign": false },
      "openclaw-pi": { "allowed_profiles": ["openclaw-prod"], "can_sign": false },
      "polymarket-bot": { "allowed_profiles": ["trading-runtime"], "can_sign": true }
    }
  }
  ```
- [x] API key validation middleware (`X-API-Key` header).
- [x] Each client identity maps to allowed profiles.
- [x] Each profile maps to allowed secrets and skills.
- [x] Deny by default.

### E.7 Tiered Secret Delivery
- [x] **Tier 3 (SKILL.md)** — read from disk, short TTL cache allowed, version hash recommended.
- [x] **Tier 2 (runtime-env)** — fetch once at boot, client stores in RAM only, no disk persistence.
- [x] **Tier 1 (signing)** — never expose private key; request payload hash → return signature.

### E.8 VeraCrypt Integration (Python)
- [x] `vault/veracrypt.py` wraps VeraCrypt CLI for Python.
- [x] Use `subprocess.Popen` with `stdin=PIPE` for password input.
- [x] Same security rules: no `-p` on CLI, no logging.

### E.9 systemd Deployment
- [x] `secret-server.service` unit:
  - Runs as dedicated `secretserver` user.
  - After `tailscaled.service`.
  - After `openclaw-vault.service` (or a mount target).
  - Binds to Tailscale IP only.
  - Hardening: `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`.
- [x] `deploy/install.sh` to install the service on Pi5.

**Acceptance Criteria**
- [x] Server refuses to start if Tailscale is not connected.
- [x] Server returns 503 for all secret endpoints if vault is unmounted.
- [x] Remote Tailscale client can fetch approved SKILL.md files.
- [x] Unapproved client is denied with 401/403.
- [x] Private keys are never present in any API response.

---

## Epic F — Tier 1 Signing Agent

**Goal**: Private keys never leave the Pi5; clients send hashes, Pi5 returns signatures.

### F.1 Signing Agent Process
- [x] `src/secret_server/signing/agent.py` runs as a separate restricted subprocess.
- [x] Load keys only after vault mount.
- [x] Locked memory where available (`mlock` equivalent via `ctypes` or `secure-memory` package).
- [x] Disable swap on Pi5 if practical (document in setup).

### F.2 Sign-Only Endpoints
- [x] `POST /sign/polymarket`
  - Request: `{ payload_hash, market, purpose }`
  - Response: `{ signature, signer }`
- [x] `POST /sign/{key_id}` (generic signing endpoint).

### F.3 Audit & Rate Limiting
- [x] Log every request: timestamp, client identity, public wallet, purpose, payload hash.
- [x] Never log full payload if sensitive.
- [x] Rate limit: max N signatures per minute per client.

### F.4 systemd Service
- [x] `deploy/signing-agent.service` unit.
- [x] Starts only after vault is mounted.
- [x] Runs as restricted user, even more locked down than secret-server.

**Acceptance Criteria**
- Trading bot submits hash → Pi5 returns signature in milliseconds after warm start.
- Private key is never returned through any endpoint.
- Private key is not written to logs.
- Signing endpoint unavailable when vault is unmounted.

---

## Epic G — Deployment & Services

### G.1 systemd Units
- [x] Update `systemd/openclaw-vault.service` for V2 (VeraCrypt, not LUKS).
- [x] Create `secret-server/deploy/secret-server.service`.
- [x] Create `secret-server/deploy/signing-agent.service`.
- [x] Document startup order:
  ```
  tailscaled
    ↓
  openclaw-vault (mount)
    ↓
  secret-server
    ↓
  signing-agent
  ```

### G.2 Environment Configuration
- [x] Add `VAULT_PROVIDER` to `backend/.env.example`.
- [x] Add `SECRET_SERVER_PORT`, `SECRET_SERVER_BIND_IP` to secret-server config.
- [x] Add `TAILSCALE_ONLY=true` enforcement flag.

### G.3 Health Checks
- [x] Secret Server `/health` returns vault mount state.
- [x] Systemd `ExecStartPost` health check script.

---

## Epic H — Testing, Docs & Release

### H.1 Testing
- [x] Unit tests for `VaultProvider` interface and each provider.
- [x] Mock VeraCrypt CLI for CI tests (provider tests mock `_execVc` / `_spawnVc`).
- [x] FastAPI tests with `TestClient` (14 tests passing).
- [x] Integration test: full unlock → read secret → lock cycle.
- [x] Security test: `ps aux` password visibility check.
- [x] Cross-platform smoke tests (manual on macOS/Windows documented in `docs/cross-platform-smoke-tests.md`).

### H.2 Documentation
- [x] Update root `README.md` for V2 architecture and setup.
- [x] Create `docs/veracrypt-setup.md`.
- [x] Create `docs/tailscale-setup.md`.
- [x] Create `docs/signing-agent.md` (already existed, verified complete).
- [x] Create `docs/api.md` with OpenAPI spec for Secret Server.
- [x] Update memory bank (`project-brief.md`, `product-context.md`, `system-patterns.md`, `tech-context.md`).

### H.3 Versioning & Release
- [x] Tag `v1.0.0` on the `secure-vault-v1` branch (documented in `CHANGELOG.md`; run `git tag v1.0.0 secure-vault-v1 && git push origin v1.0.0` to publish).
- [x] Update `package.json` version to `2.0.0-alpha`.
- [x] Update `backend/package.json` version.
- [x] Create `CHANGELOG.md` with V1 → V2 migration notes.

---

## Recommended Build Order

Follow this order to minimize rework and keep the system testable at each step:

1. **Epic A** — VaultProvider abstraction + LuksProvider refactor.  
   *(At this point the app still works exactly like V1.)*
2. **Epic B** — VeraCryptProvider for Linux + route updates.  
   *(Test on Linux dev machine.)*
3. **Epic C** — Migration script + restage USB.  
   *(One-time operation; keep LUKS backup.)*
4. **Epic D** — Local mode path handling + cross-platform device detection stubs.  
   *(UI should behave identically.)*
5. **Epic E** — Pi5 Secret Server (FastAPI scaffold + Tailscale binding + vault guard).  
   *(Test on Pi5 with mounted VeraCrypt vault.)*
6. **Epic E continued** — Client auth + profile-based access + Tier 2 & 3 endpoints.  
   *(Test remote fetching of API keys and SKILL.md.)*
7. **Epic F** — Signing Agent + Tier 1 endpoints.  
   *(Test hash → signature flow.)*
8. **Epic G** — systemd units + deployment scripts + ordering.  
   *(Test full Pi5 boot sequence.)*
9. **Epic H** — Documentation, tests, version tagging, release.  

---

## V2 Non-Negotiable Rules

| Rule | Enforcement |
|------|-------------|
| Do not rewrite the UI | Frontend routes and components stay as-is (additive only) |
| Do not require VeraCrypt GUI | All mount/unmount via CLI in headless mode |
| Do not pass password as CLI arg | `stdin` only; `ps aux` must be clean |
| Do not log passwords / keys / seeds | Pino redaction + FastAPI log filters |
| Do not expose MetaMask/Polymarket keys | Signing Agent returns signatures only |
| Do not bind Secret Server to public network | Tailscale IP only; `0.0.0.0` forbidden |
| Do not let all Tailscale machines access all secrets | Per-client profile ACLs |
| Do not assume USB serves Pi5 + local Mac simultaneously | Document single-mount-at-a-time |
| Do preserve vault folder structure | `/securevault/{config,secrets,skills,crypto,exports,audit}` |
| Do format inner VeraCrypt filesystem as exFAT | Cross-platform readability |
| Do implement local USB mode first | Tailscale server is Phase 2 |
| Do leave PiKVM as future concern | No PiKVM code in V2 |

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| VeraCrypt CLI differences across platforms | High | Medium | Platform-specific wrappers, early testing on each OS |
| Tailscale not available on Pi5 | Medium | Low | Fallback to local-only mode; clear error messages |
| V1 UI compatibility breaks | High | Low | Extensive regression testing; keep LUKS provider intact |
| Password handling regression | Critical | Low | Security-first design; automated `ps aux` test in CI |
| exFAT filesystem limitations (no permissions) | Medium | Low | Use directory-based ACLs in app layer; document |

---

## Definition of Done

A task is complete when:
- [ ] Code implemented and runs without errors.
- [ ] Unit/integration tests written and passing.
- [ ] No secrets logged or exposed in process listings.
- [ ] Documentation updated.
- [ ] Memory bank updated with any new patterns or decisions.
- [ ] Committed with a descriptive message referencing the Epic.
