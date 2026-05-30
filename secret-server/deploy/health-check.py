#!/usr/bin/env python3
"""
Systemd ExecStartPost health check for Secret Server.

Polls the /health endpoint until the service reports healthy or a timeout
is reached. Designed to run concurrently with a Type=simple service startup.

Usage (systemd):
    ExecStartPost=/opt/secret-server/venv/bin/python /opt/secret-server/deploy/health-check.py
"""
import os
import sys
import time
import urllib.request

MAX_RETRIES = 10
DELAY_SECONDS = 1
TIMEOUT_SECONDS = 5


def _get_tailscale_ip() -> str | None:
    """Best-effort Tailscale IP discovery."""
    try:
        import socket
        addrs = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
        for addr in addrs:
            ip = addr[4][0]
            if ip.startswith("100."):
                return ip
    except Exception:
        pass

    # Fallback: parse `ip -4 -o addr show`
    try:
        import subprocess
        result = subprocess.run(
            ["ip", "-4", "-o", "addr", "show"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        for line in result.stdout.splitlines():
            parts = line.split()
            for part in parts:
                if part.startswith("100."):
                    return part.split("/")[0]
    except Exception:
        pass

    return None


def _resolve_host() -> str:
    """Resolve the host to poll based on env / config."""
    # 1. Explicit override for health checks
    explicit = os.environ.get("SECRET_SERVER_HEALTH_HOST")
    if explicit:
        return explicit

    # 2. Try importing config (works when venv is used)
    try:
        sys.path.insert(0, "/opt/secret-server/src")
        from secret_server.config import get_tailscale_ip, settings  # type: ignore

        host = settings.host
        if settings.tailscale_only:
            ts_ip = get_tailscale_ip()
            if ts_ip:
                host = ts_ip
        return host
    except Exception:
        pass

    # 3. Fallback to env vars / defaults
    tailscale_only = os.environ.get("SECRET_SERVER_TAILSCALE_ONLY", "true").lower() == "true"
    host = os.environ.get("SECRET_SERVER_HOST", "127.0.0.1")

    if tailscale_only:
        ts_ip = _get_tailscale_ip()
        if ts_ip:
            host = ts_ip
    return host


def _resolve_port() -> int:
    try:
        sys.path.insert(0, "/opt/secret-server/src")
        from secret_server.config import settings  # type: ignore
        return int(settings.port)
    except Exception:
        pass
    return int(os.environ.get("SECRET_SERVER_PORT", "8000"))


def main() -> int:
    host = _resolve_host()
    port = _resolve_port()
    url = f"http://{host}:{port}/health"

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as resp:
                if resp.status == 200:
                    print("Health check passed")
                    return 0
        except Exception as exc:
            print(f"Attempt {attempt}/{MAX_RETRIES}: {exc}", file=sys.stderr)

        time.sleep(DELAY_SECONDS)

    print(f"Health check failed after {MAX_RETRIES} attempts ({url})", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
