# Trading Bot Integration Guide

## Situation

Your **trading bot** and your **Secure Vault** are on the **same Linux machine**. The vault is mounted at `/mnt/securevault`. The bot needs to sign blockchain transactions (e.g., Polymarket) using a private key stored in the vault.

There are **two ways** to do this. Pick one.

---

## Path A — Direct Key Read (Simplest)

Since the bot and vault are on the same machine, the bot can read the private key directly from the mounted encrypted volume and sign locally using `eth-account` or `web3.py`.

**Pros:** Zero services to configure. Two lines of code.  
**Cons:** The private key exists briefly in the bot's memory.

### Step A1 — Place the key on the vault

The user must place the raw hex private key on the vault:

```bash
sudo mkdir -p /mnt/securevault/crypto
sudo chmod 700 /mnt/securevault/crypto
sudo tee /mnt/securevault/crypto/polymarket.key > /dev/null
# User pastes their raw hex EVM private key (with or without 0x prefix), then Ctrl+D
sudo chmod 600 /mnt/securevault/crypto/polymarket.key
```

### Step A2 — Bot code

```python
from eth_account import Account

# Read the key directly from the mounted vault
with open("/mnt/securevault/crypto/polymarket.key", "r") as f:
    private_key = f.read().strip()

account = Account.from_key(private_key)

# Sign any 32-byte hash
payload_hash = "0x" + "aa" * 32  # your keccak256 hash
signed = account.unsafe_sign_hash(bytes.fromhex(payload_hash[2:]))
signature = signed.signature.hex()

print("Address:", account.address)
print("Signature:", signature)
```

**Dependencies:** `pip install eth-account`

That's it. No API keys, no profiles, no services. The bot reads the key from the encrypted volume just like reading any other file.

---

## Path B — Secret Server API (More Secure)

The bot never touches the private key. It sends a hash to a local API (`localhost:8787`) and receives back a signature. The key stays inside the hardened signing agent's memory.

**Pros:** Key never enters bot's memory. Rate limiting and audit logs.  
**Cons:** Requires installing and running the secret-server + signing-agent.

### Step B1 — Install the secret-server

```bash
cd ~/secure-vault/secret-server
sudo bash deploy/install.sh
```

This creates two system users (`secretserver`, `signingagent`) and installs systemd services.

### Step B2 — Create the auth profile

```bash
sudo mkdir -p /mnt/securevault/config/auth
sudo tee /mnt/securevault/config/auth/profiles.json > /dev/null <<'EOF'
{
  "clients": {
    "trading-bot": {
      "api_key": "sk-vault-bot-<random-token>",
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

Generate the token:
```bash
python3 -c "import secrets; print('sk-vault-bot-' + secrets.token_hex(24))"
```

### Step B3 — Place the signing key

```bash
sudo mkdir -p /mnt/securevault/crypto
sudo chmod 700 /mnt/securevault/crypto
sudo tee /mnt/securevault/crypto/polymarket.key > /dev/null
# User pastes raw hex private key, then Ctrl+D
sudo chmod 600 /mnt/securevault/crypto/polymarket.key
sudo chown signingagent:signingagent /mnt/securevault/crypto/polymarket.key
```

### Step B4 — Start services

```bash
sudo systemctl start openclaw-vault   # if not already mounted
sudo systemctl start secret-server
sudo systemctl start signing-agent
```

### Step B5 — Bot code

```python
import os
import requests

VAULT_URL = "http://127.0.0.1:8787"
VAULT_API_KEY = os.environ["VAULT_API_KEY"]  # the token from Step B2

# Sign a payload hash (the API returns a real ECDSA secp256k1 signature)
response = requests.post(
    f"{VAULT_URL}/sign/polymarket",
    headers={"X-API-Key": VAULT_API_KEY, "Content-Type": "application/json"},
    json={"payload_hash": "0x" + "aa" * 32, "market": "ETH-USD", "purpose": "order"}
)
response.raise_for_status()
signature = response.json()["signature"]
print("Signature:", signature)
```

**Dependencies:** `pip install requests`

---

## Which path should you choose?

| Concern | Choose |
|---------|--------|
| "I want the absolute minimum setup" | **Path A** — direct file read |
| "I want the key out of the bot process" | **Path B** — API signing |
| "I need rate limiting and audit logs" | **Path B** — API signing |
| "The bot might be moved to another machine later" | **Path B** — API signing (just change `127.0.0.1` to Tailscale IP) |

---

## Quick Verification (Path B only)

If you chose Path B, verify everything works before running the bot:

```bash
export VAULT_API_KEY="sk-vault-bot-<your-token>"

# Test signing
curl -s -X POST http://127.0.0.1:8787/sign/polymarket \
  -H "X-API-Key: $VAULT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payload_hash":"0x'$(python3 -c "print('aa'*32)")'","market":"ETH-USD","purpose":"test"}'
```

Expected output (real ECDSA signature, ~130 hex chars):
```json
{"signature": "a1b2c3d4...", "signer": "polymarket"}
```

---

## Troubleshooting

### `401 Invalid API key` (Path B)
- The `api_key` in `profiles.json` doesn't match what the bot sends.
- Fix: restart the secret-server after editing `profiles.json`:
  ```bash
  sudo systemctl restart secret-server
  ```

### `403 Signing not allowed` (Path B)
- The client in `profiles.json` has `"can_sign": false`. Change it to `true`.

### `503 Signing agent unavailable` (Path B)
- The signing-agent service is not running:
  ```bash
  sudo systemctl status signing-agent
  sudo systemctl start signing-agent
  ```

### `FileNotFoundError: Key file not found` (both paths)
- `/mnt/securevault/crypto/polymarket.key` is missing. Place it per Step A1/B3.

### `ValueError: payload_hash must be a 32-byte hex string` (both paths)
- The hash you are signing must be exactly 64 hex characters (32 bytes). Example: `"0x" + "aa" * 32`.

---

## What changed in the codebase

1. **`secret-server/src/secret_server/api/secrets.py`** — Default env filename changed from `runtime.env` to `.env` so it matches the Node backend's auto-sync.
2. **`secret-server/src/secret_server/signing/agent.py`** — Replaced the HMAC-SHA256 placeholder with **real ECDSA secp256k1 signing** via `eth-account`.
3. **`secret-server/requirements.txt` / `pyproject.toml`** — Added `eth-account>=0.13.0` dependency.
4. **`docs/trading-bot-integration.md`** — Rewritten for same-machine setups with two clear paths.
