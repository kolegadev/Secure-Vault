import os

from fastapi import HTTPException

from ..config import settings


def is_vault_mounted() -> bool:
    return os.path.ismount(settings.vault_mount_point) or os.path.exists(
        os.path.join(settings.vault_mount_point, "vault-manifest.json")
    )


async def require_vault_mounted() -> str:
    if not is_vault_mounted():
        raise HTTPException(status_code=503, detail="Vault is not mounted")
    return settings.vault_mount_point


async def vault_status_dependency() -> dict:
    return {"mounted": is_vault_mounted(), "mount_path": settings.vault_mount_point}
