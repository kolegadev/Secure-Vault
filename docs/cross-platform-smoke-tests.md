# Cross-Platform Smoke Tests

These are manual validation steps to run after migrating a vault or setting up a new machine. They verify that the VeraCrypt volume mounts and the Secure Vault application works correctly on each target platform.

## Linux (Raspberry Pi / Debian / Ubuntu)

### 1. VeraCrypt Mount

```bash
sudo veracrypt -t --mount /dev/sdX1 /mnt/securevault --stdin <<EOF
your-password
EOF

ls -la /mnt/securevault
sudo veracrypt -t --dismount /mnt/securevault
```

**Expected:** Volume mounts without GUI prompts; directory structure is intact.

### 2. Backend Startup

```bash
cd /opt/openclaw-vault
VAULT_PROVIDER=veracrypt npm start
```

**Expected:** Server starts on port 3001. `GET /api/health` returns `{"status":"ok"}`.

### 3. Full UI Cycle

1. Open `http://localhost:3001` in a browser.
2. Log in with the VeraCrypt passphrase.
3. Mount the vault from the UI.
4. Create an environment variable.
5. Export a `.env` file.
6. Lock the vault from the UI.

**Expected:** Each step succeeds without errors; no passwords appear in browser DevTools Network tab request payloads.

## macOS

### 1. VeraCrypt Mount

```bash
/Applications/VeraCrypt.app/Contents/MacOS/VeraCrypt -t --mount /dev/disk2 /Volumes/SecureVault --stdin <<EOF
your-password
EOF

ls -la /Volumes/SecureVault
/Applications/VeraCrypt.app/Contents/MacOS/VeraCrypt -t --dismount /Volumes/SecureVault
```

**Expected:** Volume mounts; files are readable.

### 2. Local Backend Startup

```bash
cd openclaw-secure-vault
VAULT_PROVIDER=veracrypt VAULT_MOUNT_POINT=/Volumes/SecureVault npm run dev
```

**Expected:** Backend starts; frontend is accessible at `http://localhost:5173`.

### 3. UI Smoke Test

Same steps as Linux UI cycle.

**Expected:** All steps succeed.

## Windows

### 1. VeraCrypt Mount

Using VeraCrypt GUI or CLI:

```powershell
VeraCrypt.exe /text /mount \\Device\Harddisk1\Partition1 S: /stdin
# Enter password interactively
```

**Expected:** Drive `S:` appears in File Explorer with vault contents.

### 2. Local Backend Startup

In PowerShell:

```powershell
$env:VAULT_PROVIDER="veracrypt"
$env:VAULT_MOUNT_POINT="S:"
cd openclaw-secure-vault
npm run dev
```

**Expected:** Backend starts; frontend is accessible at `http://localhost:5173`.

### 3. UI Smoke Test

Same steps as Linux UI cycle.

**Expected:** All steps succeed.

## Pi5 Secret Server

### 1. Tailscale Connectivity

```bash
ping <pi5-tailscale-ip>
```

**Expected:** Sub-50ms latency; no packet loss.

### 2. Health Check

```bash
curl http://<pi5-tailscale-ip>:8787/health
```

**Expected:** `{"status":"ok","vault_mounted":true,"tailscale_only":true}`.

### 3. Secret Retrieval

```bash
curl -H "X-API-Key: <client-key>" \
  http://<pi5-tailscale-ip>:8787/secrets/runtime-env \
  -d '{"profile":"local-dev"}'
```

**Expected:** JSON response with approved secrets; no private keys exposed.

### 4. Signing Request

```bash
curl -H "X-API-Key: <client-key>" \
  http://<pi5-tailscale-ip>:8787/sign/polymarket \
  -d '{"payload_hash":"abc123","market":"ETH-USD","purpose":"test"}'
```

**Expected:** `{"signature":"...","signer":"polymarket"}`; 64-char hex signature.

## Security Validation

On any platform where the backend is running:

```bash
# While mounting the vault via UI or CLI, check process listings
ps aux | grep -i veracrypt
```

**Expected:** No password strings appear in the output.

## Notes

- These tests are intentionally manual because they require physical USB devices and OS-specific GUI/CLI interactions.
- Run them after every migration (`bin/migrate-luks-to-veracrypt.sh`) before deleting the temporary backup.
- Document any platform-specific deviations in this file.
