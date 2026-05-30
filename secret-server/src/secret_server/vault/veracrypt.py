import json
import os
import shutil
import subprocess
from typing import List, Optional

from ..config import settings


class VeraCryptVault:
    def __init__(self, mount_point: Optional[str] = None):
        self.mount_point = mount_point or settings.vault_mount_point
        self.device_path = settings.vault_device_path
        self.veracrypt_bin = self._resolve_binary()

    def _resolve_binary(self) -> str:
        for name in ["veracrypt", "VeraCrypt", "/usr/bin/veracrypt"]:
            path = shutil.which(name)
            if path:
                return path
        raise RuntimeError("VeraCrypt binary not found")

    def is_mounted(self) -> bool:
        return os.path.ismount(self.mount_point) or os.path.exists(
            os.path.join(self.mount_point, "vault-manifest.json")
        )

    def read_manifest(self) -> Optional[dict]:
        path = os.path.join(self.mount_point, "vault-manifest.json")
        if not os.path.exists(path):
            return None
        with open(path, "r") as f:
            return json.load(f)

    def list_secrets(self) -> List[str]:
        path = os.path.join(self.mount_point, settings.secrets_dir)
        if not os.path.exists(path):
            return []
        return [f for f in os.listdir(path) if f.endswith(".env") or "." not in f]

    def list_skills(self) -> List[str]:
        path = os.path.join(self.mount_point, settings.skills_dir)
        if not os.path.exists(path):
            return []
        return [
            d
            for d in os.listdir(path)
            if os.path.isdir(os.path.join(path, d))
        ]

    def mount(self, password: str, device_path: Optional[str] = None) -> None:
        dp = device_path or self.device_path
        if not dp:
            raise RuntimeError("No device path configured")
        cmd = [
            self.veracrypt_bin,
            "--text",
            "--mount",
            dp,
            self.mount_point,
            "--stdin",
        ]
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            proc.stdin.write(password + "\n")
            proc.stdin.close()
            proc.wait(timeout=settings.vault_mount_timeout)
        except Exception:
            proc.kill()
            raise
        if proc.returncode != 0:
            stderr = proc.stderr.read() if proc.stderr else ""
            raise RuntimeError(f"VeraCrypt mount failed: {stderr}")
        # Best-effort clear
        password = "0" * len(password)
        del password

    def unmount(self) -> None:
        cmd = [self.veracrypt_bin, "--text", "--dismount", self.mount_point]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            raise RuntimeError(f"VeraCrypt unmount failed: {result.stderr}")

    def detect_devices(self) -> List[dict]:
        devices = []
        by_id = "/dev/disk/by-id"
        if os.path.isdir(by_id):
            for entry in os.listdir(by_id):
                if "usb" in entry.lower():
                    full = os.path.join(by_id, entry)
                    real = os.path.realpath(full)
                    devices.append({"name": entry, "path": real})
        return devices
