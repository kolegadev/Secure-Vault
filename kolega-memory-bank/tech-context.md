# Tech Context

## Technology Stack
| Layer | Technology | Version |
|-------|------------|---------|
| OS | Raspberry Pi OS (Bookworm, 64-bit) | Latest |
| Runtime | Node.js | 20.x LTS |
| Backend Framework | Express.js | 4.x |
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
│   │   └── platforms.js       # Platform-specific defaults (VeraCrypt paths, mount points)
│   ├── routes/
│   │   ├── auth.js            # /api/auth/* (login, logout, status)
│   │   ├── luks.js            # /api/luks/* (create, unlock, lock, keyslot)
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
│   │   ├── errors.js               # VaultError, MountError, ValidationError
│   │   ├── luksManager.js          # @deprecated — legacy cryptsetup wrapper
│   │   ├── providers/
│   │   │   ├── LuksProvider.js     # LUKS adapter (implements VaultProvider)
│   │   │   └── VeraCryptProvider.js # VeraCrypt CLI adapter (cross-platform)
│   │   ├── usbMonitor.js           # udevadm monitor + fallback polling
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
├── bin/
│   ├── setup.sh               # Full system setup (root required)
│   ├── usb-inserted.sh        # udev trigger script
│   └── backup.sh              # LUKS header + full disk backup
├── systemd/
│   └── openclaw-vault.service # Hardened systemd unit
├── package.json               # Root workspace orchestration
└── README.md                  # Project documentation
```

## LUKS Volume Structure (mounted at /mnt/openclaw-vault)
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

## Testing Strategy
| Layer | Method | Coverage |
|-------|--------|----------|
| LUKS operations | Shell scripts + cryptsetup | Volume lifecycle |
| API endpoints | Jest + Supertest | All CRUD, error cases, auth |
| Frontend components | Vitest + React Testing Library | Form validation, state transitions |
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

## Dev Notes
- Backend uses pure ESM (`"type": "module"`)
- Frontend proxies `/api` and `/ws` to backend in dev mode
- WebSocket falls back to polling `/dev/disk/by-id` if udevadm is unavailable
- Database uses WAL mode for concurrent access safety
- All file operations validated against mount point prefix only
