import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from ..auth.client_auth import auth_manager, require_api_key
from ..config import settings
from ..vault.guard import require_vault_mounted

router = APIRouter()


@router.get("")
async def list_skills(
    client_id: str = Depends(require_api_key),
    vault: str = Depends(require_vault_mounted),
):
    auth_manager.ensure_loaded()
    allowed_profiles = auth_manager.get_allowed_profiles(client_id)
    if not allowed_profiles:
        raise HTTPException(status_code=403, detail="No profiles assigned")

    skills_dir = os.path.join(vault, settings.skills_dir)
    if not os.path.exists(skills_dir):
        return []

    tools = []
    for tool in os.listdir(skills_dir):
        tool_path = os.path.join(skills_dir, tool)
        if os.path.isdir(tool_path):
            allowed = any(
                auth_manager.profile_allows_skill(p, tool, "SKILL.md")
                for p in allowed_profiles
            )
            if allowed:
                tools.append(tool)
    return tools


@router.get("/{tool}/{file}")
async def get_skill(
    tool: str,
    file: str,
    client_id: str = Depends(require_api_key),
    vault: str = Depends(require_vault_mounted),
):
    auth_manager.ensure_loaded()
    allowed_profiles = auth_manager.get_allowed_profiles(client_id)
    allowed = any(
        auth_manager.profile_allows_skill(p, tool, file)
        for p in allowed_profiles
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Skill not allowed for this client")

    file_path = os.path.join(vault, settings.skills_dir, tool, file)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Skill not found")

    with open(file_path, "r") as f:
        content = f.read()

    return PlainTextResponse(content=content)
