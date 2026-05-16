# OpenClaw Secure Vault

A local browser-based utility that runs on a Raspberry Pi 5 and manages sensitive environment variables, API service documentation, and Agent SKILL.md files stored on a **LUKS-encrypted USB 3.0 drive**.

## Features

- **LUKS Volume Management** — Create, unlock, lock, and manage LUKS2-encrypted USB drives via web UI
- **Environment Variable Dashboard** — Full CRUD with redaction, metadata, service linking, and auto-generated `.env` files
- **SKILL.md Registry** — YAML frontmatter parsing, validation, Markdown preview, and OpenClaw path integration
- **Service Management** — Register API services with Swagger URLs and auto-generate `README.md` documentation
- **Real-time USB Monitoring** — WebSocket-based USB insertion/removal detection
- **Secure Session Auth** — LUKS passphrase is the sole credential; server-side sessions with automatic expiry
- **Export & Backup** — Export `.env` files, skill archives, and full vault ZIP backups

## Architecture

```
Browser (React SPA) <-> Express API <-> cryptsetup / udev / mount <-> LUKS USB (ext4)
```

## Required Dependencies

### System Dependencies

| Package | Purpose |
|---------|---------|
| `node` >= 18.0.0 | Runtime |
| `npm` >= 9.0.0 | Package manager |
| `cryptsetup` / `cryptsetup-bin` | LUKS volume operations |
| `udisks2` | USB block device helpers |
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
# Configure your USB device path
sudo nano /opt/openclaw-vault/backend/.env

# Start and enable the service
sudo systemctl start openclaw-vault
sudo systemctl enable openclaw-vault
```

### Manual Setup (Development)

```bash
# 1. Install Node.js 20.x and system dependencies
#    (cryptsetup, build-essential, etc.)

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
| `LUKS_DEVICE_PATH` | `/dev/sdb1` | USB block device to encrypt/unlock |
| `LUKS_MOUNT_POINT` | `/mnt/openclaw-vault` | Where the vault is mounted |
| `LUKS_MAPPER_NAME` | `openclaw-vault` | Device mapper name |
| `LOG_LEVEL` | `info` | Pino log level |
| `LOG_PRETTY` | `true` | Pretty-print logs (disable in production) |

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

## Project Structure

```
.
├── backend/              # Express API
│   ├── server.js         # Entry point (HTTP + WebSocket)
│   ├── db/               # SQLite schema & migrations
│   ├── routes/           # API endpoints
│   ├── services/         # LUKS, USB, file manager, skills, README generator
│   ├── middleware/       # Auth, rate limit, error handling
│   └── config/           # Configuration loader
├── frontend/             # React SPA (Vite)
│   ├── src/
│   │   ├── components/   # Views (Login, Dashboard, EnvVars, Skills, Services, Settings)
│   │   ├── hooks/        # useApi, useVaultStatus
│   │   └── styles/       # Tailwind CSS
│   └── index.html
├── bin/                  # Setup & utility scripts
│   ├── setup.sh
│   ├── usb-inserted.sh
│   └── backup.sh
├── systemd/              # systemd service unit
│   └── openclaw-vault.service
└── package.json          # Root workspace orchestration
```

## Quick Command Reference

| Command | Purpose |
|---------|---------|
| `npm run install:all` | Install all dependencies |
| `npm run dev` | Start backend + frontend in dev mode |
| `npm run build` | Build frontend for production |
| `npm start` | Start production backend |
| `cd backend && npm run db:migrate` | Run database migrations |
| `sudo bash bin/setup.sh` | Full system deployment |
| `sudo bash bin/backup.sh` | Backup LUKS header + disk image |

## Security Notes

- **LUKS passphrase = sole credential** — no separate user system
- Passphrase is piped directly to `cryptsetup` stdin; never logged or shell-interpolated
- Dedicated `openclaw-vault` OS user with sudoers restricted to `cryptsetup`, `mount`, `umount`
- Rate limiting (5 logins/min, 100 API calls/min)
- Secure `HttpOnly` session cookies with `SameSite=Strict`
- Path traversal guards on all file operations

## License

MIT
