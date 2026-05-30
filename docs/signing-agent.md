# Signing Agent

The Signing Agent is a restricted subprocess that handles all cryptographic signing operations. It runs as a separate systemd service (`signing-agent.service`) and communicates with the main Secret Server via a Unix domain socket.

## Architecture

- **Process Isolation**: The agent runs under its own user (`signingagent`) with stricter systemd hardening than the main server.
- **Memory Locking**: Private keys are loaded into locked memory pages using `mlock` (best-effort on Linux).
- **Zero Persistence**: Keys are read from the vault on demand and overwritten immediately after use.
- **Socket Protocol**: JSON line protocol over Unix socket (`/run/signing-agent/signing.sock`).

## Swap Hardening (Pi5)

For maximum key security, disable swap before running the signing agent:

```bash
sudo dphys-swapfile swapoff
sudo systemctl disable dphys-swapfile
```

## Protocol

### Request
```json
{"key_id": "polymarket", "payload_hash": "0x..."}
```

### Response
Success:
```json
{"signature": "...", "signer": "polymarket"}
```

Error:
```json
{"error": "Vault not mounted"}
```

## Rate Limiting

The main Secret Server enforces per-client rate limits on signing endpoints (default: 10 req/min). The agent itself does not rate-limit.

## Audit

Every signing request is logged by the main server to `<vault>/audit/signing.log` with:
- timestamp
- client_id
- key_id
- market / purpose
- payload_hash

Private keys and full payloads are never written to logs.
