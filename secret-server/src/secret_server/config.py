import os
import socket
import subprocess
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "OpenClaw Secret Server"
    version: str = "2.0.0-alpha"
    env: str = "production"

    # Network
    host: str = "127.0.0.1"
    port: int = 8000

    # Tailscale
    tailscale_only: bool = True

    # Vault
    vault_mount_point: str = "/mnt/securevault"
    vault_device_path: Optional[str] = None
    vault_provider: str = "veracrypt"
    vault_mount_timeout: int = 30

    # Paths inside vault
    secrets_dir: str = "secrets"
    skills_dir: str = "skills"
    config_dir: str = "config"
    crypto_dir: str = "crypto"
    audit_dir: str = "audit"
    exports_dir: str = "exports"

    # Auth
    profiles_file: str = "auth/profiles.json"

    # Signing Agent
    signing_agent_socket: str = "/run/signing-agent/signing.sock"
    signing_rate_limit_per_minute: int = 10
    use_signing_agent: bool = True

    # Logging
    log_level: str = "INFO"

    class Config:
        env_prefix = "SECRET_SERVER_"
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()


def get_tailscale_ip() -> Optional[str]:
    """Scan network interfaces for a Tailscale IP (100.x.x.x)."""
    try:
        addrs = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
        for addr in addrs:
            ip = addr[4][0]
            if ip.startswith("100."):
                return ip
    except Exception:
        pass

    # Fallback: parse `ip -4 addr show` (Linux only)
    try:
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
