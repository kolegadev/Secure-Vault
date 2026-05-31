import os
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from ..auth.client_auth import auth_manager, require_api_key
from ..config import settings
from ..vault.guard import require_vault_mounted

router = APIRouter()


@router.get("/profiles")
async def list_profiles(
    client_id: str = Depends(require_api_key),
):
    auth_manager.ensure_loaded()
    allowed = auth_manager.get_allowed_profiles(client_id)
    return JSONResponse(content={"profiles": allowed})


@router.post("/runtime-env")
async def get_runtime_env(
    request: dict,
    client_id: str = Depends(require_api_key),
    vault: str = Depends(require_vault_mounted),
):
    auth_manager.ensure_loaded()
    profile_name = request.get("profile")
    allowed_profiles = auth_manager.get_allowed_profiles(client_id)

    if profile_name not in allowed_profiles:
        raise HTTPException(status_code=403, detail="Profile not allowed")

    if not auth_manager.profile_allows_secret(profile_name, "runtime-env"):
        raise HTTPException(status_code=403, detail="Secret not allowed for this profile")

    env_name = request.get("env_name", "runtime.env")
    
    # Strict whitelist validation: only allow alphanumeric chars, dots, and hyphens
    if not re.match(r'^[a-zA-Z0-9._-]+$', env_name):
        raise HTTPException(status_code=400, detail="Invalid env_name: only alphanumeric characters, dots, and hyphens are allowed")
    
    # Remove any potential path separators for additional safety
    env_name = os.path.basename(env_name)
    
    # Construct the expected path
    secrets_base_dir = os.path.join(vault, settings.secrets_dir)
    env_path = os.path.join(secrets_base_dir, env_name)
    
    # Verify the resolved path is within the expected directory
    try:
        secrets_base_dir = os.path.realpath(secrets_base_dir)
        env_path = os.path.realpath(env_path)
        if os.path.commonpath([secrets_base_dir, env_path]) != secrets_base_dir:
            raise HTTPException(status_code=400, detail="Access denied: path outside allowed directory")
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not os.path.exists(env_path):
        raise HTTPException(status_code=404, detail="Env file not found")

    secrets = {}
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                secrets[k] = v

    return JSONResponse(content={"profile": profile_name, "secrets": secrets})
