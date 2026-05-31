# Changelog

All notable changes to the OpenClaw Secure Vault project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **`bin/update-vault.sh`** — Safe in-place update script for deployed instances. Stops the service, backs up the SQLite DB (with retention pruning), pulls the latest branch into the source clone, syncs **code only** into the deployment (preserving `backend/.env`, `backend/data/`, `node_modules`, and `frontend/dist`), then runs `npm install`/`build`/`db:migrate` **inside the deployment under its own Node version** to avoid the `better-sqlite3` `NODE_MODULE_VERSION` mismatch that re-running `bin/setup.sh` would cause. Configurable via env (`VAULT_APP`, `VAULT_SERVICE`, `VAULT_BRANCH`, `VAULT_PORT`, `GITHUB_TOKEN`, `KEEP_BACKUPS`). Codifies the "Updating a Deployed Instance" procedure in the README.

### Changed

- **Signing Agent** — Replaced the HMAC-SHA256 placeholder with real ECDSA secp256k1 signing via `eth_keys`: signs 32-byte keccak256 digests and returns a 65-byte `0x + r + s + v` Ethereum-compatible signature. Adds the `eth-account>=0.13` dependency.

---

## [2.0.0-alpha] — 2026-05-30

### Added

- **VeraCrypt backend** — Cross-platform vault provider supporting Linux, macOS, and Windows.
- **VaultProvider abstraction** — Pluggable interface with `LuksProvider` (legacy) and `VeraCryptProvider` implementations.
- **Secure sudo wrappers** — `securevault-veracrypt-mount` and `securevault-veracrypt-unmount` for hardened Linux permissions.
- **Migration tool** — `bin/migrate-luks-to-veracrypt.sh` for one-time LUKS → VeraCrypt migration with integrity verification.
- **Secret Server (FastAPI)** — Pi5-based Tailscale-only secret server with profile-based ACLs.
- **Signing Agent** — Restricted subprocess for Tier 1 signing (hash in, signature out) with rate limiting and audit logging.
- **Health checks** — Systemd `ExecStartPost` health-check script for the Secret Server.
- **Unit & integration tests** — Backend test suite covering VaultProvider, both providers, factory, security (`ps aux` clean), and full mount-read-unmount lifecycle.
- **Documentation** — `docs/veracrypt-setup.md`, `docs/tailscale-setup.md`, `docs/api.md`, `docs/migration-guide.md`, `docs/signing-agent.md`.

### Changed

- **API routes** — `/api/luks/*` deprecated in favor of `/api/vault/*` (backward-compatible alias retained).
- **Frontend labels** — Updated to display "VeraCrypt SecureVault" instead of "LUKS SecureVault".
- **Canonical directory structure** — V2 vault layout: `secrets/`, `config/`, `skills/`, `crypto/`, `exports/`, `audit/`.
- **Configuration** — `backend/config/default.json` now uses `vault.provider` (defaults to `luks`, overridable via `VAULT_PROVIDER` env).
- **Systemd units** — Updated startup order: `tailscaled → openclaw-vault → secret-server → signing-agent`.
- **Node package versions** — Bumped root and `backend/package.json` to `2.0.0-alpha`.

### Deprecated

- `backend/services/luksManager.js` — frozen, replaced by `LuksProvider`.
- `/api/luks/*` routes — retained as aliases, will be removed in a future release.

### Security

- Passwords are passed via `stdin` only; never as CLI arguments.
- Pino logger redacts `password`, `passphrase`, `token`, `secret`, and `authorization` fields.
- Secret Server binds exclusively to Tailscale IP (`100.x.x.x`); refuses to start without one when `tailscale_only=true`.
- Per-client profile ACLs deny access by default.
- Signing Agent runs under a dedicated restricted user with `AmbientCapabilities=CAP_IPC_LOCK`.

---

## [1.0.0] — 2025-01-15

### Added

- Initial release of OpenClaw Secure Vault (V1).
- LUKS2-encrypted USB vault management via web UI.
- Environment Variable Dashboard with CRUD, redaction, and `.env` sync.
- SKILL.md Registry with YAML frontmatter parsing.
- Service Management with Swagger URL linking and README generation.
- Real-time USB monitoring via WebSocket.
- Session-based authentication using LUKS passphrase as sole credential.
- Export & Backup functionality.

[2.0.0-alpha]: https://github.com/your-repo/openclaw-secure-vault/compare/v1.0.0...v2.0.0-alpha
[1.0.0]: https://github.com/your-repo/openclaw-secure-vault/releases/tag/v1.0.0
