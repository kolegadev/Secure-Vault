# Secret Server

Pi5 Tailscale Secret Server for Secure Vault V2.

## Purpose

When the VeraCrypt USB vault is plugged into a Raspberry Pi 5, this FastAPI
service serves approved secrets and signing operations to authorized Tailscale
peers only.

## Architecture

- **Tailscale-only binding** — refuses to start without a `100.x.x.x` IP.
- **Vault guard** — returns `503` for all secret endpoints if the vault is
  unmounted.
- **Profile-based ACLs** — each client identity maps to allowed profiles,
  secrets, and skills.
- **Tiered secret delivery**:
  - Tier 3: SKILL.md files (short TTL cache allowed)
  - Tier 2: runtime-env secrets (fetch once, store in RAM only)
  - Tier 1: signing (hash in, signature out; private key never leaves the Pi)

## Quick Start

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
SECRET_SERVER_TAILSCALE_ONLY=false uvicorn secret_server.main:app --host 127.0.0.1 --port 8000
```

## Deployment

### Startup Order

```
tailscaled.service
      ↓
openclaw-vault.service  (mount VeraCrypt volume)
      ↓
secret-server.service   (FastAPI + health-check ExecStartPost)
      ↓
signing-agent.service   (isolated signing subprocess)
```

Dependencies are enforced via systemd `After=` / `Before=` directives:
- `secret-server` waits for `openclaw-vault`
- `signing-agent` waits for `secret-server`

### Installation

See `deploy/install.sh` for automated Pi5 installation.

```bash
sudo ./deploy/install.sh
```

### Health Check

`secret-server.service` runs `deploy/health-check.py` as `ExecStartPost`.
It polls `GET /health` for up to 10 seconds and exits non-zero if the
service does not become ready, causing systemd to mark the unit as failed.

Manual check:
```bash
/opt/secret-server/venv/bin/python /opt/secret-server/deploy/health-check.py
```

### Configuration

Copy `.env.example` to `.env` and adjust:

| Variable | Purpose |
|----------|---------|
| `SECRET_SERVER_HOST` | Bind IP (overridden by Tailscale IP when `tailscale_only=true`) |
| `SECRET_SERVER_PORT` | Listen port (default 8000) |
| `SECRET_SERVER_TAILSCALE_ONLY` | Refuse to start without 100.x.x.x interface |
| `SECRET_SERVER_VAULT_MOUNT_POINT` | Path to mounted vault |
| `SECRET_SERVER_USE_SIGNING_AGENT` | Proxy signing to agent subprocess |
| `SECRET_SERVER_SIGNING_AGENT_SOCKET` | Unix socket path for agent |
| `SECRET_SERVER_SIGNING_RATE_LIMIT_PER_MINUTE` | Per-client signing quota |
| `SECRET_SERVER_LOG_LEVEL` | Logging verbosity |
