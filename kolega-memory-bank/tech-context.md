# Tech Context

## Technology Stack
| Layer | Technology | Version |
|-------|------------|---------|
| OS | Raspberry Pi OS (Bookworm, 64-bit) | Latest |
| Runtime | Node.js | 20.x LTS |
| Backend Framework | Express.js | 4.x |
| Secret Server Framework | FastAPI | 0.111+ |
| Secret Server Runtime | Python | 3.11+ |
| Database | SQLite3 (via better-sqlite3) | 11.3.x |
| Frontend Framework | React | 18.x |
| Build Tool | Vite | 5.x |
| UI Styling | Tailwind CSS | 3.4.x |
| Real-time | WebSocket (ws library) | 8.x |
| Process Manager | systemd | Built-in |
| Encryption | LUKS2 (cryptsetup) or VeraCrypt | 2.x / 1.26+ |
| Filesystem | ext4 / exFAT | Built-in |

## Key npm Dependencies

### Backend
- `express` — REST API framework
- `better-sqlite3` — High-performance SQLite driver
- `ws` — WebSocket server for real-time USB/vault status
- `express-rate-limit` — API rate limiting
- `helmet` — Security headers
- `js-yaml` — YAML frontmatter parsing for SKILL.md
- `marked` — Markdown rendering
- `nanoid` — Session ID generation
- `pino` / `pino-pretty` — Structured logging with redaction
- `archiver` — ZIP export generation
- `cors`, `compression`, `cookie-parser` — Middleware

### Secret Server (Python)
- `fastapi` — REST API framework (async)
- `uvicorn[standard]` — ASGI server
- `pydantic` / `pydantic-settings` — Configuration validation
- `structlog` — Structured logging with JSON output
- `pyyaml` — YAML parsing (for profile configs)
- `python-multipart` — Form/multipart parsing

### Frontend
- `react`, `react-dom` — UI framework
- `react-router-dom` — Client-side routing
- `lucide-react` — Icon library
- `marked` — Markdown preview rendering
- `tailwindcss` — Utility-first CSS

## Development Commands
- `npm run install:all` — Install all dependencies (root, backend, frontend)
- `npm run dev` — Start both backend and frontend in dev mode
- `npm run dev:backend` — Start backend with nodemon
- `npm run dev:frontend` — Start Vite dev server
- `npm run build` — Build frontend for production
- `npm start` — Start production backend server
- `npm test` — Run backend tests
- `npm run db:migrate` — Run SQLite schema migrations
- `npm run db:seed` — Seed default data

### Secret Server
```bash
cd secret-server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Development (local loopback, Tailscale check disabled)
SECRET_SERVER_TAILSCALE_ONLY=false uvicorn secret_server.main:app --host 127.0.0.1 --port 8000
# Production (binds to Tailscale IP automatically)
python -m secret_server.run
# Signing agent (standalone subprocess)
SECRET_SERVER_USE_SIGNING_AGENT=true python -m secret_server.signing.agent_service
# Tests
pytest tests/
```

## File Structure
```
/opt/openclaw-vault/
├── backend/
│   ├── server.js              # Express + WebSocket server entry
│   ├── db/
│   │   ├── connection.js      # better-sqlite3 wrapper
│   │   ├── schema.sql         # Full SQLite schema
│   │   ├── migrate.js         # Migration runner
│   │   └── seed.js            # Seeding script (optional)
│   ├── config/
│   │   ├── default.json       # Default configuration
│   │   ├── index.js           # Config loader with env overrides
│   │   └── platforms.js       # Platform-specific defaults (VeraCrypt paths, mount points, wrappers)
│   ├── routes/
│   │   ├── auth.js            # /api/auth/* (login, logout, status)
│   │   ├── vault.js           # /api/vault/* (create, unlock, lock, keyslot, backup-header)
│   │   ├── luks.js            # @deprecated — re-exports vault.js for backward compat
│   │   ├── env.js             # /api/env/* (CRUD, bulk-delete, export)
│   │   ├── skills.js          # /api/skills/* (scan, install, uninstall)
│   │   ├── services.js        # /api/services/* (CRUD, readme generate)
│   │   ├── files.js           # /api/files/* (read, write, list)
│   │   └── export.js          # /api/export/* (dotenv, skills, full)
│   ├── middleware/
│   │   ├── auth.js            # Session creation, validation, login/logout handlers
│   │   ├── error.js           # Global error handler + 404
│   │   └── rateLimit.js       # API + auth rate limiters
│   ├── services/
│   │   ├── VaultProvider.js        # Abstract base class (provider contract)
│   │   ├── VaultProviderFactory.js # Singleton factory (luks | veracrypt)
│   │   ├── vaultPaths.js           # Cross-platform mount-point + path resolver
│   │   ├── errors.js               # VaultError, MountError, ValidationError
│   │   ├── luksManager.js          # @deprecated — legacy cryptsetup wrapper
│   │   ├── providers/
│   │   │   ├── LuksProvider.js     # LUKS adapter (implements VaultProvider)
│   │   │   └── VeraCryptProvider.js # VeraCrypt CLI adapter (cross-platform)
│   │   ├── usbMonitor.js           # udevadm monitor (Linux); provider polling (macOS/Windows)
│   │   ├── fileManager.js          # Safe vault file ops with path traversal guards
│   │   ├── skillScanner.js         # SKILL.md discovery, YAML parsing, OpenClaw install
│   │   └── readmeGenerator.js      # Auto-generated service README templates
│   ├── utils/
│   │   └── logger.js          # Pino logger with passphrase redaction
│   └── .env.example           # Environment variable template
├── frontend/
│   ├── src/
│   │   ├── main.jsx           # React entry
│   │   ├── App.jsx            # Router + sidebar layout + auth gate
│   │   ├── components/
│   │   │   ├── LoginView.jsx  # Passphrase login with real-time status
│   │   │   ├── Dashboard.jsx  # Stats, activity log, vault status cards
│   │   │   ├── EnvVarTable.jsx # Sortable table, redaction, bulk ops, modal
│   │   │   ├── SkillRegistry.jsx # Card grid, YAML preview, install/uninstall
│   │   │   ├── ServiceManager.jsx # Service cards, README generation
│   │   │   └── SettingsView.jsx # Lock vault, keyslot mgmt, header backup
│   │   ├── hooks/
│   │   │   ├── useApi.js      # Generic fetch + useFetch wrapper
│   │   │   └── useVaultStatus.js # WebSocket real-time status hook
│   │   └── styles/
│   │       └── index.css      # Tailwind + custom vault design system
│   ├── index.html             # HTML entry with Google Fonts
│   ├── vite.config.js         # Vite + proxy + React plugin
│   ├── tailwind.config.js     # Custom vault color palette
│   └── postcss.config.js      # Tailwind + autoprefixer
├── secret-server/
│   ├── src/secret_server/
│   │   ├── __init__.py        # Package init
│   │   ├── main.py            # FastAPI app factory + router registration
│   │   ├── run.py             # Uvicorn entrypoint with Tailscale IP binding
│   │   ├── config.py          # Pydantic settings + get_tailscale_ip()
│   │   ├── api/
│   │   │   ├── health.py      # GET /health
│   │   │   ├── vault.py       # GET /vault/status
│   │   │   ├── skills.py      # GET /skills, /skills/{tool}/{file}
│   │   │   ├── secrets.py     # GET /profiles, POST /secrets/runtime-env
│   │   │   ├── signing.py     # POST /sign/polymarket, /sign/{key_id}
│   │   │   └── admin.py       # POST /admin/reload
│   │   ├── vault/
│   │   │   ├── veracrypt.py   # VeraCrypt Python wrapper (stdin password)
│   │   │   └── guard.py       # require_vault_mounted() dependency
│   │   ├── auth/
│   │   │   ├── client_auth.py # API key validation + profile ACLs
│   │   │   └── profiles.py    # Pydantic models for client/profile config
│   │   └── signing/
│   │       ├── agent.py       # Signer (hash in, signature out) with mlock
│   │       ├── agent_service.py # Standalone asyncio signing agent (Unix socket)
│   │       ├── rate_limiter.py  # Sliding-window in-memory rate limiter
│   │       └── audit.py       # Signing request audit logger
│   ├── deploy/
│   │   ├── secret-server.service  # Hardened systemd unit
│   │   ├── signing-agent.service  # Hardened signing-agent systemd unit
│   │   └── install.sh             # Pi5 install script (both services)
│   ├── tests/
│   │   ├── test_api.py        # FastAPI TestClient tests
│   │   ├── test_signer.py     # Signer unit tests
│   │   └── test_rate_limiter.py # Rate limiter unit tests
│   ├── pyproject.toml         # Python packaging
│   ├── requirements.txt       # Production dependencies
│   └── README.md              # Secret Server documentation
├── bin/
│   ├── setup.sh                      # Full system setup (root required)
│   ├── usb-inserted.sh               # udev trigger script
│   ├── backup.sh                     # LUKS header + full disk backup
│   ├── migrate-luks-to-veracrypt.sh  # One-time LUKS → VeraCrypt migration
│   ├── validate-migration.mjs        # Node.js helper for migration validation
│   ├── securevault-veracrypt-mount   # Sudoers-safe VeraCrypt mount wrapper
│   └── securevault-veracrypt-unmount # Sudoers-safe VeraCrypt unmount wrapper
├── docs/
│   ├── migration-guide.md            # LUKS → VeraCrypt migration documentation
│   └── signing-agent.md              # Signing Agent architecture & protocol
├── systemd/
│   └── openclaw-vault.service # Hardened systemd unit
├── package.json               # Root workspace orchestration
└── README.md                  # Project documentation
```

## Legacy V1 Volume Structure (mounted at /mnt/openclaw-vault)
```
/mnt/openclaw-vault/
├── vault.db              # SQLite metadata database
├── env/                  # Generated .env files
│   └── .env
├── skills/               # SKILL.md library
│   └── {skill-dir}/
│       └── SKILL.md
├── services/             # Service documentation
│   └── {service}.md
└── exports/              # Export bundles
```

## Canonical V2 Volume Structure (mounted at /mnt/securevault)
```
/mnt/securevault/
├── vault.db              # SQLite metadata database
├── vault-manifest.json   # Vault metadata manifest
├── config/               # Service docs, profiles, config files
├── secrets/              # Environment variable files (.env)
├── skills/               # SKILL.md library
├── crypto/               # Signing keys, wallets (Tier 1)
├── exports/              # Export bundles
└── audit/                # Access and mount event logs
```

**Migration mapping:** `env/` → `secrets/`, `services/` → `config/`. The remaining directories (`skills`, `exports`) are preserved in place. `crypto/` and `audit/` are created empty if they do not exist.

**Config mapping:** `paths.envDir` → `secrets`, `paths.servicesDir` → `config`. New V2 keys: `paths.cryptoDir`, `paths.auditDir`. Environment variables `VAULT_MOUNT_POINT` and `VAULT_DEVICE_PATH` override `vault.mountPoint` and `vault.devicePath`.

## Testing Strategy
| Layer | Method | Coverage |
|-------|--------|----------|
| LUKS operations | Shell scripts + cryptsetup | Volume lifecycle |
| Node API endpoints | Jest + Supertest | All CRUD, error cases, auth |
| Frontend components | Vitest + React Testing Library | Form validation, state transitions |
| Secret Server endpoints | pytest + FastAPI TestClient | Vault guard, auth, signing |
| Integration | Playwright | Full user journeys |
| Security | Manual penetration testing | Rate limits, CSRF, session hijacking |

## Security Patterns
- Passphrase piped to cryptsetup stdin (never shell-interpolated)
- Passphrase cleared from memory immediately after unlock
- Dedicated service user with sudoers restricted to cryptsetup/mount/umount
- udev rule matches specific USB serial number
- Rate limiting + secure session cookies
- Helmet.js + CSP + path traversal guards
- Pino redaction for all secret fields
- Secret Server passwords passed via `subprocess.Popen(stdin=PIPE)` only; never as CLI args
- Secret Server private keys loaded from vault `crypto/` and cleared from memory after signing
- Secret Server signing agent runs as separate restricted subprocess with `mlock` on key material
- Secret Server rate limiting on signing endpoints (per-client, 10 req/min default)
- Secret Server audit log: every signing request logged to `audit/signing.log`

## Dev Notes
- Backend uses pure ESM (`"type": "module"`)
- Frontend proxies `/api` and `/ws` to backend in dev mode
- WebSocket falls back to polling `/dev/disk/by-id` if udevadm is unavailable
- Database uses WAL mode for concurrent access safety
- All file operations validated against mount point prefix only
- `vaultPaths.js` is the single source of truth for mount-point resolution; never use `config.luks.mountPoint` directly in new code
- Secret Server config uses `pydantic-settings` with env prefix `SECRET_SERVER_`
- Secret Server `run.py` resolves Tailscale IP at startup and binds Uvicorn to it
