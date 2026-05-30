# OpenClaw Secure Vault

A local browser-based utility that manages sensitive environment variables, API service documentation, and Agent SKILL.md files stored on a **VeraCrypt-encrypted USB drive**. Supports local mode (Linux, macOS, Windows) and an optional Pi5 Tailscale Secret Server for remote secret retrieval.

## Features

- **VeraCrypt Volume Management** — Create, mount, and dismount VeraCrypt-encrypted USB drives via web UI (headless CLI, no GUI required)
- **Environment Variable Dashboard** — Full CRUD with redaction, metadata, service linking, and auto-generated `.env` files
- **SKILL.md Registry** — YAML frontmatter parsing, validation, Markdown preview, and OpenClaw path integration
- **Service Management** — Register API services with Swagger URLs and auto-generate `README.md` documentation
- **Real-time USB Monitoring** — WebSocket-based USB insertion/removal detection
- **Secure Session Auth** — VeraCrypt passphrase is the sole credential; server-side sessions with automatic expiry
- **Export & Backup** — Export `.env` files, skill archives, and full vault ZIP backups
- **Pi5 Secret Server (Optional)** — FastAPI server over Tailscale with profile-based ACLs and a restricted Signing Agent

## Architecture

### Local Mode
```
Browser (React SPA) <-> Express API <-> VeraCrypt CLI <-> Encrypted USB (exFAT)
```

### Pi5 Secret Server Mode
```
Remote Client (Tailscale) <-> FastAPI Secret Server <-> Signing Agent
                                        ↓
                                VeraCrypt USB (exFAT)
```

## Required Dependencies

### System Dependencies

| Package | Purpose |
|---------|---------|
| `node` >= 18.0.0 | Runtime |
| `npm` >= 9.0.0 | Package manager |
| `veracrypt` | VeraCrypt CLI (Linux/macOS/Windows) |
| `build-essential` | Native module compilation |
| `sqlite3` | CLI database inspection (optional) |

### Node.js Dependencies

Backend and frontend dependencies are declared in their respective `package.json` files. Key packages:

**Backend:** `express`, `better-sqlite3`, `ws`, `helmet`, `express-rate-limit`, `pino`, `js-yaml`, `marked`, `archiver`

**Frontend:** `react`, `react-router-dom`, `lucide-react`, `marked`, `tailwindcss`

## Installation

### Automated Setup (Recommended for Raspberry Pi)

Run the setup script as root. It installs system packages, Node.js 20.x, creates the `openclaw-vault` service user, configures restricted sudoers, and installs the systemd service.

```bash
sudo bash bin/setup.sh
```

After setup completes:

```bash
# Configure your USB device path and provider
sudo nano /opt/openclaw-vault/backend/.env

# Start and enable the service
sudo systemctl start openclaw-vault
sudo systemctl enable openclaw-vault
```

### Manual Setup (Development)

```bash
# 1. Install Node.js 20.x and system dependencies
#    (veracrypt, build-essential, etc.)

# 2. Install all Node dependencies
npm run install:all

# 3. Run database migrations
cd backend && npm run db:migrate

# 4. Build the frontend for production
npm run build
```

## Configuration

Copy `backend/.env.example` to `backend/.env` and adjust values:

```bash
cp backend/.env.example backend/.env
```

Key environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Express server port |
| `HOST` | `0.0.0.0` | Bind address |
| `SESSION_SECRET` | *(required)* | Min 32-char secret for session signing |
| `VAULT_PROVIDER` | `luks` | Backend: `luks` or `veracrypt` |
| `VAULT_DEVICE_PATH` | `/dev/sdb1` | USB block device |
| `VAULT_MOUNT_POINT` | `/mnt/securevault` | Where the vault is mounted |
| `LOG_LEVEL` | `info` | Pino log level |
| `LOG_PRETTY` | `true` | Pretty-print logs (disable in production) |

For Secret Server configuration, see `secret-server/.env.example`.

## Starting and Stopping

### Development Mode

Runs the backend with `nodemon` and the frontend Vite dev server with API proxying.

```bash
# From the repository root
npm run dev
```

- Backend API: http://localhost:3001
- Frontend UI: http://localhost:5173

```bash
# To stop, press Ctrl+C in the terminal
```

### Production Mode

```bash
# Build the frontend first
npm run build

# Start the backend server only
cd backend && npm start
```

### Systemd Service (Production on Raspberry Pi)

```bash
# Start
sudo systemctl start openclaw-vault

# Stop
sudo systemctl stop openclaw-vault

# Restart
sudo systemctl restart openclaw-vault

# View logs
sudo journalctl -u openclaw-vault -f

# Check status
sudo systemctl status openclaw-vault
```

### Secret Server (Pi5)

```bash
# Start
sudo systemctl start secret-server

# View logs
sudo journalctl -u secret-server -f

# Check health
curl http://100.x.x.x:8787/health
```

## Project Structure

```
.
├── backend/              # Express API
│   ├── server.js         # Entry point (HTTP + WebSocket)
│   ├── db/               # SQLite schema & migrations
│   ├── routes/           # API endpoints (/api/vault, /api/env, ...)
│   ├── services/         # VaultProvider, USB monitor, file manager
│   ├── middleware/       # Auth, rate limit, error handling
│   └── config/           # Configuration loader
├── frontend/             # React SPA (Vite)
│   ├── src/
│   │   ├── components/   # Views (Login, Dashboard, EnvVars, Skills, Services, Settings)
│   │   ├── hooks/        # useApi, useVaultStatus
│   │   └── styles/       # Tailwind CSS
│   └── index.html
├── secret-server/        # FastAPI Secret Server (Pi5)
│   ├── src/secret_server/
│   ├── deploy/           # systemd units & install script
│   └── tests/            # pytest suite
├── bin/                  # Setup & utility scripts
│   ├── setup.sh
│   ├── migrate-luks-to-veracrypt.sh
│   ├── securevault-veracrypt-mount
│   └── securevault-veracrypt-unmount
├── docs/                 # Documentation
│   ├── veracrypt-setup.md
│   ├── tailscale-setup.md
│   ├── migration-guide.md
│   ├── signing-agent.md
│   └── api.md
├── systemd/              # systemd service units
│   ├── openclaw-vault.service
│   ├── secret-server.service
│   └── signing-agent.service
└── package.json          # Root workspace orchestration
```

## Quick Command Reference

| Command | Purpose |
|---------|---------|
| `npm run install:all` | Install all dependencies |
| `npm run dev` | Start backend + frontend in dev mode |
| `npm run build` | Build frontend for production |
| `npm start` | Start production backend |
| `cd backend && npm test` | Run backend test suite |
| `cd backend && npm run db:migrate` | Run database migrations |
| `sudo bash bin/setup.sh` | Full system deployment |
| `sudo bash bin/migrate-luks-to-veracrypt.sh` | Migrate V1 LUKS → V2 VeraCrypt |

## Documentation

- [VeraCrypt Setup](docs/veracrypt-setup.md) — Install and configure VeraCrypt CLI
- [Tailscale Setup](docs/tailscale-setup.md) — Configure Tailscale for Secret Server
- [Migration Guide](docs/migration-guide.md) — LUKS to VeraCrypt migration
- [Signing Agent](docs/signing-agent.md) — Architecture and protocol
- [API Documentation](docs/api.md) — Secret Server endpoints

## Security Notes

- **VeraCrypt passphrase = sole credential** — no separate user system
- Passphrase is piped directly to `veracrypt` stdin; never logged or shell-interpolated
- Dedicated `openclaw-vault` OS user with sudoers restricted to secure wrapper scripts
- Rate limiting (5 logins/min, 100 API calls/min)
- Secure `HttpOnly` session cookies with `SameSite=Strict`
- Path traversal guards on all file operations
- Secret Server binds to Tailscale IP only; refuses to serve secrets if vault is unmounted
- Signing Agent returns signatures only — private keys never leave the Pi5

## License

MIT
