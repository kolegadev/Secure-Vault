import os
from typing import Optional

from fastapi import Header, HTTPException

from ..config import settings


class AuthManager:
    def __init__(self):
        self._profiles: dict = {}
        self._clients: dict = {}
        self._loaded = False

    def reload(self) -> None:
        import json
        path = os.path.join(
            settings.vault_mount_point, settings.config_dir, settings.profiles_file
        )
        if not os.path.exists(path):
            self._profiles = {}
            self._clients = {}
            self._loaded = True
            return

        with open(path, "r") as f:
            data = json.load(f)

        self._clients = data.get("clients", {})
        self._profiles = data.get("profiles", {})
        self._loaded = True

    def ensure_loaded(self) -> None:
        if not self._loaded:
            self.reload()

    def validate_api_key(self, api_key: str) -> Optional[str]:
        self.ensure_loaded()
        for client_id, client in self._clients.items():
            if client.get("api_key") == api_key:
                return client_id
        return None

    def get_client(self, client_id: str) -> Optional[dict]:
        self.ensure_loaded()
        return self._clients.get(client_id)

    def get_allowed_profiles(self, client_id: str) -> list:
        client = self.get_client(client_id)
        if not client:
            return []
        return client.get("allowed_profiles", [])

    def profile_allows_secret(self, profile_name: str, secret_name: str) -> bool:
        profile = self._profiles.get(profile_name, {})
        allowed = profile.get("allowed_secrets", [])
        return secret_name in allowed or "*" in allowed

    def profile_allows_skill(self, profile_name: str, tool: str, file: str) -> bool:
        profile = self._profiles.get(profile_name, {})
        allowed = profile.get("allowed_skills", [])
        if "*" in allowed:
            return True
        return f"{tool}/{file}" in allowed or tool in allowed

    def can_sign(self, client_id: str) -> bool:
        client = self.get_client(client_id)
        if not client:
            return False
        return client.get("can_sign", False)

    def is_admin(self, client_id: str) -> bool:
        client = self.get_client(client_id)
        if not client:
            return False
        return client.get("is_admin", False)


auth_manager = AuthManager()


async def require_api_key(x_api_key: str = Header(..., alias="X-API-Key")) -> str:
    client_id = auth_manager.validate_api_key(x_api_key)
    if not client_id:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return client_id
