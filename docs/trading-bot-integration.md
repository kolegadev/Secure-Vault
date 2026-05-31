# Trading Bot Integration Guide

## Purpose

This document is a step-by-step playbook for connecting an external trading bot (or any remote client) to the **OpenClaw Secret Server** running on a Raspberry Pi 5 over Tailscale. The bot will:

1. Retrieve runtime secrets (API keys, etc.) from the vault **without** ever seeing the private key.
2. Request cryptographic signatures for blockchain transactions from the **Signing Agent** — again, the private key never leaves the Pi.

---

## Prerequisites (must be true before you start)

| # | Requirement | How to verify |
|---|-------------|---------------|
| 1 | Pi is on Tailscale | `tailscale status` shows `100.x.x.x` |
| 2 | VeraCrypt USB is mounted | `ls /mnt/securevault` shows directories |
| 3 | Node vault (`:3001`) is running | `curl http://localhost:3001/api/health` |
| 4 | At least one env var exists in the Node UI | `ls /mnt/securevault/secrets/.env` |
| 5 | Python 3.11+ installed | `python3 --version` |
| 6 | You have `sudo` access on the Pi | `sudo whoami` |

---

## Part 1 — Install the Secret Server on the Pi

The Secret Server is **not** installed automatically by `bin/setup.sh`. It has its own installer.

### Step 1.1 — Run the installer

```bash
cd ~/secure-vault/secret-server
sudo bash deploy/install.sh
```

**What this does:**
- Creates two system users: `secretserver` and `signingagent`
- Copies code to `/opt/secret-server`
- Creates a Python virtual environment at `/opt/secret-server/venv`
- Installs systemd services: `secret-server.service` and `signing-agent.service`

**Expected output:**
```
Installing OpenClaw Secret Server...
Installation complete.
Startup order:
  tailscaled → openclaw-vault (mount) → secret-server → signing-agent
```

### Step 1.2 — Verify installation

```bash
ls -la /opt/secret-server/
# Should show: deploy/  src/  venv/  requirements.txt

ls -la /etc/systemd/system/secret-server.service
ls -la /etc/systemd/system/signing-agent.service
# Both should exist
```

---

## Part 2 — Provision the Vault Files

The Secret Server reads **only** from files on `/mnt/securevault`. The Node vault auto-syncs env vars, but three things must be created manually.

### Step 2.1 — Ensure the V2 directory structure exists

```bash
sudo mkdir -p /mnt/securevault/{secrets,config/auth,skills,crypto,exports,audit}
```

**Verify:**
```bash
ls -la /mnt/securevault/
# Should show: audit  config  crypto  exports  secrets  skills  vault-manifest.json
```

> **Note:** `vault-manifest.json` is created automatically by the Node vault or migration script. If missing, the secret-server will still work but will log a warning.

### Step 2.2 — Verify env vars are synced

The Node backend writes `/mnt/securevault/secrets/.env` automatically whenever you create/update/delete an env var in the web UI.

```bash
cat /mnt/securevault/secrets/.env
```

**Expected output example:**
```
POLY_API_KEY=abc123
POLY_API_SECRET=xyz789
WALLET_ADDRESS=0x...
```

**If this file is missing:** Open the web UI at `http://<pi-ip>:3001`, go to **Environment Variables**, and create any variable. The file will appear instantly.

### Step 2.3 — Create the auth profiles file

This file controls **who** can access **what**. Without it, every API call is rejected.

Create `/mnt/securevault/config/auth/profiles.json`:

```bash
sudo mkdir -p /mnt/securevault/config/auth
sudo tee /mnt/securevault/config/auth/profiles.json > /dev/null <<'EOF'
{
  "clients": {
    "trading-bot": {
      "api_key": "sk-vault-bot-REPLACE_ME",
      "allowed_profiles": ["trading-runtime"],
      "can_sign": true,
      "is_admin": false
    }
  },
  "profiles": {
    "trading-runtime": {
      "allowed_secrets": ["*"],
      "allowed_skills": ["*"]
    }
  }
}
EOF
sudo chmod 640 /mnt/securevault/config/auth/profiles.json
sudo chown secretserver:secretserver /mnt/securevault/config/auth/profiles.json
```

**Generate a real API key (run this and paste it into the file above):**

```bash
python3 -c "import secrets; print('sk-vault-bot-' + secrets.token_hex(24))"
```

**Example output:** `sk-vault-bot-a1b2c3d4e5f6...`

> **Important:** This API key is a *capability token*. It is **not** your EVM private key. It only proves the bot is authorized to talk to the secret-server.

### Step 2.4 — Place the signing key

The Signing Agent reads the private key from `/mnt/securevault/crypto/polymarket.key`. This is the **most sensitive file**. The user must place it manually.

**Tell the user to run:**

```bash
sudo mkdir -p /mnt/securevault/crypto
sudo chmod 700 /mnt/securevault/crypto
sudo tee /mnt/securevault/crypto/polymarket.key > /dev/null
# Then they paste their raw hex private key (no 0x prefix) and press Ctrl+D
sudo chmod 600 /mnt/securevault/crypto/polymarket.key
sudo chown signingagent:signingagent /mnt/securevault/crypto/polymarket.key
```

**Verify the key file exists and has correct ownership:**

```bash
ls -la /mnt/securevault/crypto/polymarket.key
# -rw------- 1 signingagent signingagent ... /mnt/securevault/crypto/polymarket.key
```

> **Critical:** Never store this file in the Node SQLite DB. The Signing Agent reads it directly from the encrypted volume.

### Step 2.5 — Ensure correct permissions for the vault mount

The `secretserver` and `signingagent` users need read access to the mounted volume.

```bash
sudo chmod 755 /mnt/securevault
sudo chmod 755 /mnt/securevault/secrets
sudo chmod 755 /mnt/securevault/config
sudo chmod 700 /mnt/securevault/crypto
```

---

## Part 3 — Start the Services

### Step 3.1 — Service startup order (enforced by systemd)

The systemd units already declare dependencies:

```
tailscaled → openclaw-vault → secret-server → signing-agent
```

Start them in order if they are not already running:

```bash
# 1. Tailscale (usually already running)
sudo systemctl start tailscaled

# 2. Mount the vault
sudo systemctl start openclaw-vault

# 3. Start the secret server
sudo systemctl start secret-server

# 4. Start the signing agent
sudo systemctl start signing-agent
```

### Step 3.2 — Verify each service is active

```bash
sudo systemctl is-active tailscaled
sudo systemctl is-active openclaw-vault
sudo systemctl is-active secret-server
sudo systemctl is-active signing-agent
```

**All four should print:** `active`

### Step 3.3 — Verify Tailscale IP is detected

```bash
curl -s http://100.x.x.x:8787/health | jq .
```

Replace `100.x.x.x` with the Pi's Tailscale IP (`tailscale ip -4`).

**Expected output:**
```json
{
  "status": "ok",
  "version": "2.0.0-alpha",
  "vault_mounted": true,
  "tailscale_only": true
}
```

If `vault_mounted` is `false`, the vault is not mounted at `/mnt/securevault`.

---

## Part 4 — Test the API Endpoints

Run these tests **from the Pi itself** first. Once they work, test from the remote bot machine over Tailscale.

### Step 4.1 — Test secret retrieval

```bash
export VAULT_API_KEY="sk-vault-bot-<the-key-from-step-2.3>"

curl -s -X POST http://127.0.0.1:8787/secrets/runtime-env \
  -H "X-API-Key: $VAULT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"profile":"trading-runtime"}' | jq .
```

**Expected output:**
```json
{
  "profile": "trading-runtime",
  "secrets": {
    "POLY_API_KEY": "abc123",
    "POLY_API_SECRET": "xyz789",
    "WALLET_ADDRESS": "0x..."
  }
}
```

**Common errors:**
- `401 Invalid API key` → `profiles.json` is missing or the key doesn't match.
- `403 Profile not allowed` → The `allowed_profiles` array doesn't include `"trading-runtime"`.
- `404 Env file not found` → `/mnt/securevault/secrets/.env` is missing. Create an env var in the Node UI.
- `503 Vault is not mounted` → `openclaw-vault.service` is not running or the mount point is wrong.

### Step 4.2 — Test signing with a dummy hash

```bash
curl -s -X POST http://127.0.0.1:8787/sign/polymarket \
  -H "X-API-Key: $VAULT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payload_hash":"deadbeef","market":"ETH-USD","purpose":"test"}' | jq .
```

**Expected output:**
```json
{
  "signature": "a1b2c3d4...",
  "signer": "polymarket"
}
```

**Common errors:**
- `403 Signing not allowed` → The client in `profiles.json` has `"can_sign": false`.
- `429 Rate limit exceeded` → More than 10 signing requests in the last 60 seconds. Wait and retry.
- `503 Signing agent unavailable` → The signing-agent socket is missing or the service is down.
- `500 Internal server error` → The key file is missing or unreadable. Check `/mnt/securevault/crypto/polymarket.key`.

### Step 4.3 — Test from the remote bot machine (over Tailscale)

From your laptop or the bot's host:

```bash
export PI_TAILSCALE_IP="100.x.x.x"   # The Pi's Tailscale IP
export VAULT_API_KEY="sk-vault-bot-..."

curl -s -X POST http://$PI_TAILSCALE_IP:8787/health | jq .

curl -s -X POST http://$PI_TAILSCALE_IP:8787/secrets/runtime-env \
  -H "X-API-Key: $VAULT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"profile":"trading-runtime"}' | jq .
```

If this fails with `Connection refused`, Tailscale ACLs may be blocking port `8787`. Ensure the Pi's Tailscale IP is reachable (`ping 100.x.x.x`).

---

## Part 5 — Bot Code Example (Python)

This is a **complete, working** Python client. Copy it into your trading bot project.

```python
"""
OpenClaw Secret Server client for trading bots.

Requires: pip install requests
"""
import os
import time
from typing import Dict, Optional

import requests


class VaultClientError(Exception):
    pass


class VaultClient:
    """
    Client for the OpenClaw Secret Server.

    Usage:
        client = VaultClient(
            base_url="http://100.x.x.x:8787",
            api_key="sk-vault-bot-..."
        )

        secrets = client.get_secrets("trading-runtime")
        signature = client.sign_polymarket(
            payload_hash="0xdeadbeef...",
            market="ETH-USD",
            purpose="market-order"
        )
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: int = 10,
        max_retries: int = 3,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        self._session = requests.Session()
        self._session.headers.update({
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
        })

    def _request(self, method: str, path: str, **kwargs) -> dict:
        url = f"{self.base_url}{path}"
        last_err = None

        for attempt in range(1, self.max_retries + 1):
            try:
                resp = self._session.request(
                    method, url, timeout=self.timeout, **kwargs
                )
                resp.raise_for_status()
                return resp.json()
            except requests.exceptions.HTTPError as exc:
                if exc.response.status_code == 429:
                    # Rate limited — backoff and retry
                    wait = attempt * 2
                    time.sleep(wait)
                    last_err = exc
                    continue
                raise VaultClientError(
                    f"Vault API error {exc.response.status_code}: {exc.response.text}"
                )
            except requests.exceptions.RequestException as exc:
                last_err = exc
                time.sleep(attempt)
                continue

        raise VaultClientError(f"Vault request failed after {self.max_retries} attempts: {last_err}")

    def health(self) -> dict:
        """Check vault health. Does not require API key."""
        resp = requests.get(f"{self.base_url}/health", timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    def get_secrets(self, profile: str = "trading-runtime") -> Dict[str, str]:
        """Retrieve runtime secrets from the vault."""
        result = self._request(
            "POST",
            "/secrets/runtime-env",
            json={"profile": profile},
        )
        return result.get("secrets", {})

    def sign_polymarket(
        self,
        payload_hash: str,
        market: Optional[str] = None,
        purpose: Optional[str] = None,
    ) -> str:
        """
        Sign a payload hash using the polymarket key.

        Returns the signature hex string.
        """
        body = {"payload_hash": payload_hash}
        if market:
            body["market"] = market
        if purpose:
            body["purpose"] = purpose

        result = self._request("POST", "/sign/polymarket", json=body)
        return result["signature"]

    def sign_generic(self, key_id: str, payload_hash: str, purpose: Optional[str] = None) -> str:
        """Sign with any key ID (e.g. 'polymarket')."""
        body = {"payload_hash": payload_hash}
        if purpose:
            body["purpose"] = purpose

        result = self._request("POST", f"/sign/{key_id}", json=body)
        return result["signature"]


# ──────────────────────────────────────────────
# Example usage (paste into your bot)
# ──────────────────────────────────────────────
if __name__ == "__main__":
    client = VaultClient(
        base_url=os.environ.get("VAULT_URL", "http://100.x.x.x:8787"),
        api_key=os.environ["VAULT_API_KEY"],
    )

    # 1. Check health
    print("Health:", client.health())

    # 2. Load secrets
    secrets = client.get_secrets("trading-runtime")
    print("Loaded secrets:", list(secrets.keys()))

    # 3. Sign something
    sig = client.sign_polymarket(
        payload_hash="0xdeadbeef",
        market="ETH-USD",
        purpose="test"
    )
    print("Signature:", sig)
```

---

## Part 6 — One-Command Diagnostics Script

Run this on the Pi to see the entire state at a glance:

```bash
#!/bin/bash
set -e

echo "========================================"
echo "OpenClaw Secret Server Diagnostics"
echo "========================================"

echo ""
echo "--- Tailscale ---"
tailscale status | head -3 || true

echo ""
echo "--- Service Status ---"
for svc in openclaw-vault secret-server signing-agent; do
    printf "%-20s %s\n" "$svc:" "$(systemctl is-active $svc 2>/dev/null || echo 'not found')"
done

echo ""
echo "--- Mount Point ---"
ls -ld /mnt/securevault 2>/dev/null || echo "MISSING"

echo ""
echo "--- Vault Files ---"
for f in secrets/.env config/auth/profiles.json crypto/polymarket.key; do
    path="/mnt/securevault/$f"
    if [ -f "$path" ]; then
        printf "%-40s OK  (%s)\n" "$f" "$(stat -c '%U:%G %a' "$path")"
    else
        printf "%-40s MISSING\n" "$f"
    fi
done

echo ""
echo "--- Secret Server Health ---"
TS_IP=$(tailscale ip -4 2>/dev/null || echo "127.0.0.1")
curl -s "http://$TS_IP:8787/health" | jq . 2>/dev/null || echo "FAILED (is secret-server running?)"

echo ""
echo "--- Signing Agent Socket ---"
ls -la /run/signing-agent/signing.sock 2>/dev/null || echo "MISSING"

echo ""
echo "========================================"
echo "Diagnostics complete"
echo "========================================"
```

Save it as `~/vault-diag.sh`, run `chmod +x ~/vault-diag.sh && ~/vault-diag.sh`.

---

## Part 7 — Troubleshooting Quick Reference

### Secret Server won't start

```bash
sudo journalctl -u secret-server -n 50 --no-pager
```

Common causes:
- Tailscale IP not found → `tailscale up` not run.
- Port 8787 in use → `sudo lsof -i :8787`
- Missing Python deps → Re-run `sudo bash deploy/install.sh`

### `401 Invalid API key`

1. Check `profiles.json` exists: `cat /mnt/securevault/config/auth/profiles.json`
2. Verify the key in the file matches exactly what the bot sends.
3. The secret-server caches profiles in memory. Restart it after editing:
   ```bash
   sudo systemctl restart secret-server
   ```

### `403 Signing not allowed`

The bot client in `profiles.json` must have `"can_sign": true`. Example:
```json
"trading-bot": {
  "api_key": "...",
  "can_sign": true
}
```

### `503 Signing agent unavailable`

1. Check the signing-agent service:
   ```bash
   sudo systemctl status signing-agent
   ```
2. Check the socket exists:
   ```bash
   ls -la /run/signing-agent/signing.sock
   ```
3. If missing, restart:
   ```bash
   sudo systemctl restart signing-agent
   ```
4. Check the agent logs:
   ```bash
   sudo journalctl -u signing-agent -n 50 --no-pager
   ```

### `404 Env file not found`

The file `/mnt/securevault/secrets/.env` is missing. Fix:
1. Open the Node vault UI (`http://<pi>:3001`)
2. Create any environment variable
3. Verify: `cat /mnt/securevault/secrets/.env`

### `500 Internal server error` on signing

The Signing Agent could not read the key file. Check:
```bash
sudo ls -la /mnt/securevault/crypto/polymarket.key
sudo -u signingagent head -c 10 /mnt/securevault/crypto/polymarket.key
```
If the second command fails with "Permission denied", the ownership or permissions are wrong. Fix:
```bash
sudo chown signingagent:signingagent /mnt/securevault/crypto/polymarket.key
sudo chmod 600 /mnt/securevault/crypto/polymarket.key
```

---

## Part 8 — Security Checklist

Before putting real funds through this system:

- [ ] `polymarket.key` is `chmod 600` and owned by `signingagent`
- [ ] `profiles.json` is `chmod 640` and owned by `secretserver`
- [ ] The bot API key is a randomly generated token (not reused from anywhere else)
- [ ] The Pi firewall blocks port `8787` from non-Tailscale interfaces
- [ ] Swap is disabled (`sudo systemctl status dphys-swapfile` should show inactive)
- [ ] The vault auto-locks after a timeout (configure in the Node UI Settings)
- [ ] The signing-agent service has `AmbientCapabilities=CAP_IPC_LOCK` (check with `systemctl cat signing-agent`)

---

## Summary of Files and Responsibilities

| File | Who creates it | How |
|------|----------------|-----|
| `/mnt/securevault/secrets/.env` | **Node backend** (auto) | Create env var in web UI |
| `/mnt/securevault/config/auth/profiles.json` | **You (Claude Code)** | `sudo tee` the JSON file |
| `/mnt/securevault/crypto/polymarket.key` | **User** (manual) | Paste raw hex key, `chmod 600` |
| `/mnt/securevault/vault-manifest.json` | **Node backend** (auto) | Migration or first mount |
