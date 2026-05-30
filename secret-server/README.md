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

See `deploy/install.sh` and `deploy/secret-server.service` for Pi5 systemd
deployment.
