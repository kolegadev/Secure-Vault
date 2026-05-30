# Tailscale Setup Guide

## Overview

The Secret Server binds exclusively to your Tailscale IP (`100.x.x.x`). This ensures that secrets are never exposed to the public internet, even if the Pi5 is on an untrusted network.

## Prerequisites

- A Tailscale account (free tier is sufficient)
- Tailscale installed on:
  - The Raspberry Pi 5 (server)
  - Every client that needs to access secrets (Mac, PC, other Pi)

## Install Tailscale on Raspberry Pi 5

```bash
# Install
curl -fsSL https://tailscale.com/install.sh | sh

# Start and authenticate
sudo tailscale up
```

Follow the URL printed to the console to authenticate with your Tailscale account.

## Verify Tailscale IP

```bash
ip addr show tailscale0 | grep 'inet '
# or
 tailscale ip -4
```

You should see an address in the `100.x.x.x` range.

## Configure Secret Server

Copy the example environment file and edit:

```bash
cd /opt/secret-server
cp .env.example .env
nano .env
```

Minimum required settings:

```bash
SECRET_SERVER_TAILSCALE_ONLY=true
SECRET_SERVER_HOST=100.x.x.x   # your Pi's Tailscale IP
SECRET_SERVER_PORT=8787
SECRET_SERVER_VAULT_MOUNT_POINT=/mnt/securevault
```

## Firewall & Network Hardening

The Secret Server refuses to start if `SECRET_SERVER_TAILSCALE_ONLY=true` and no Tailscale IP is detected. For additional defense, configure `iptables` or `nftables` to block inbound connections on the Secret Server port from non-Tailscale interfaces:

```bash
# Example: allow port 8787 only on tailscale0
sudo iptables -A INPUT -i tailscale0 -p tcp --dport 8787 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8787 -j DROP
```

## Client Access

Each client must:

1. Install Tailscale and join the same tailnet.
2. Obtain an API key from the Secret Server admin.
3. Make requests with the `X-API-Key` header.

Example:

```bash
curl -H "X-API-Key: your-api-key" \
  http://100.x.x.x:8787/skills
```

## Service Startup Order

Ensure systemd starts services in the correct order:

```
tailscaled
  ↓
openclaw-vault (mounts VeraCrypt volume)
  ↓
secret-server
  ↓
signing-agent
```

The provided systemd units include `After=` and `Before=` directives to enforce this.

## Troubleshooting

### Secret Server fails to start with "No Tailscale IP found"
- Verify `tailscale0` interface exists: `ip link show tailscale0`
- Re-authenticate: `sudo tailscale up`

### Clients cannot connect
- Verify both devices show as "Connected" in the Tailscale admin console.
- Check that MagicDNS or direct IP routing is working: `ping 100.x.x.x`
- Ensure the Secret Server is listening on the Tailscale IP: `sudo ss -tlnp | grep 8787`

### Certificate warnings
- The Secret Server uses plain HTTP over Tailscale. Tailscale itself encrypts the wire traffic via WireGuard, so TLS is not required inside the tailnet.
