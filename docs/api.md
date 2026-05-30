# Secret Server API Documentation

## Overview

The Secret Server exposes a minimal REST API for remote secret retrieval and signing. All endpoints return JSON.

**Base URL:** `http://<tailscale-ip>:8787`

**Authentication:** `X-API-Key` header (except `/health`).

## OpenAPI Specification

FastAPI auto-generates OpenAPI docs at runtime:

- `GET /docs` — Swagger UI
- `GET /openapi.json` — Raw OpenAPI schema

## Endpoints

### Health Check

```
GET /health
```

**Auth:** None

**Response:**
```json
{
  "status": "ok",
  "version": "2.0.0-alpha",
  "vault_mounted": true,
  "tailscale_only": true
}
```

### Vault Status

```
GET /vault/status
```

**Auth:** `X-API-Key`

**Response:**
```json
{
  "mounted": true,
  "mount_path": "/mnt/securevault",
  "vault_id": "vault-manifest-uuid",
  "manifest_valid": true
}
```

**Errors:**
- `503` — Vault is not mounted.

### List Skills

```
GET /skills
```

**Auth:** `X-API-Key`

**Response:**
```json
[
  { "name": "polymarket-trading", "path": "skills/polymarket-trading" },
  { "name": "github-agent", "path": "skills/github-agent" }
]
```

### Read Skill File

```
GET /skills/{tool}/{file}
```

**Auth:** `X-API-Key`

**Example:**
```bash
curl -H "X-API-Key: key" http://100.x.x.x:8787/skills/polymarket-trading/SKILL.md
```

**Response:** Raw Markdown text.

**Errors:**
- `404` — File not found.
- `403` — Skill not in client's allowed profile.

### List Profiles

```
GET /profiles
```

**Auth:** `X-API-Key`

**Response:**
```json
{
  "profiles": ["local-dev", "trading-runtime"],
  "client_id": "macbook-pro"
}
```

### Runtime Environment Secrets

```
POST /secrets/runtime-env
```

**Auth:** `X-API-Key`

**Body:**
```json
{
  "profile": "trading-runtime"
}
```

**Response:**
```json
{
  "profile": "trading-runtime",
  "secrets": {
    "POLY_API_KEY": "...",
    "POLY_API_SECRET": "..."
  }
}
```

**Errors:**
- `403` — Profile not allowed for this client.
- `503` — Vault is not mounted.

### Sign Payload (Generic)

```
POST /sign/{key_id}
```

**Auth:** `X-API-Key` + signing permission (`can_sign: true`)

**Body:**
```json
{
  "payload_hash": "deadbeef...",
  "purpose": "trade-execution"
}
```

**Response:**
```json
{
  "signature": "a1b2c3d4...",
  "signer": "polymarket"
}
```

**Errors:**
- `403` — Client is not allowed to sign.
- `429` — Rate limit exceeded.
- `503` — Vault is not mounted.

### Sign Polymarket Payload

```
POST /sign/polymarket
```

**Auth:** `X-API-Key` + signing permission

**Body:**
```json
{
  "payload_hash": "cafebabe...",
  "market": "ETH-USD",
  "purpose": "order"
}
```

**Response:** Same format as generic sign endpoint.

### Admin Reload

```
POST /admin/reload
```

**Auth:** `X-API-Key` + admin permission (`is_admin: true`)

**Response:**
```json
{
  "success": true,
  "reloaded": ["profiles", "manifest"]
}
```

## Rate Limits

- Signing endpoints: **10 requests per minute** per client (configurable via `SECRET_SERVER_SIGNING_RATE_LIMIT_PER_MINUTE`).
- Other endpoints: subject to general API rate limiting (configured in middleware).

## Error Responses

All errors follow this shape:

```json
{
  "detail": "Human-readable error message"
}
```

Common HTTP status codes:

| Code | Meaning |
|------|---------|
| `400` | Bad request (missing/invalid body) |
| `401` | Missing API key |
| `403` | Forbidden (profile/skill/action not allowed) |
| `404` | Resource not found |
| `422` | Validation error (FastAPI) |
| `429` | Rate limit exceeded |
| `503` | Vault not mounted |

## Client Profiles

Access control is driven by `config/auth/profiles.json` inside the vault:

```json
{
  "clients": {
    "my-macbook": {
      "api_key": "sk-...",
      "allowed_profiles": ["local-dev"],
      "can_sign": false,
      "is_admin": false
    }
  },
  "profiles": {
    "local-dev": {
      "allowed_secrets": ["*"],
      "allowed_skills": ["*"]
    }
  }
}
```

Clients are denied by default. No client can access secrets or skills outside its allowed profiles.
