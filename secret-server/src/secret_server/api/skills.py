import os
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from ..auth.client_auth import auth_manager, require_api_key
from ..config import settings
from ..vault.guard import require_vault_mounted

router = APIRouter()


def _validate_path_component(name: str) -> None:
    """Validate that a path component is safe and contains only allowed characters."""
    if not name:
        raise ValueError("Path component cannot be empty")
    
    # Allow only alphanumeric characters and hyphens
    if not re.match(r'^[a-zA-Z0-9\-]+$', name):
        raise ValueError("Path component can only contain alphanumeric characters and hyphens")
    
    # Additional safety check - reject any component containing path separators or relative path components
    if '/' in name or '\\' in name or '..' in name:
        raise ValueError("Path component cannot contain path separators or relative path components")


def _validate_file_path(vault: str, tool: str, file: str) -> str:
    """Validate and construct a safe file path within the skills directory."""
    # Validate both path components
    _validate_path_component(tool)
    _validate_path_component(file)
    
    # Construct the expected path
    skills_base = os.path.join(vault, settings.skills_dir)
    tool_dir = os.path.join(skills_base, tool)
    file_path = os.path.join(tool_dir, file)
    
    # Resolve to absolute paths to handle any potential symlinks or relative path components
    resolved_skills_base = os.path.realpath(skills_base)
    resolved_file_path = os.path.realpath(file_path)
    
    # Verify the resolved file path is within the expected skills directory
    try:
        common_path = os.path.commonpath([resolved_skills_base, resolved_file_path])
        if common_path != resolved_skills_base:
            raise ValueError("File path resolves to location outside skills directory")
    except ValueError:
        # commonpath can raise ValueError for paths on different drives (Windows)
        raise ValueError("File path resolves to invalid location")
    
    return file_path


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
    # Validate path components and construct safe file path
    try:
        file_path = _validate_file_path(vault, tool, file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid path parameters")
    
    auth_manager.ensure_loaded()
    allowed_profiles = auth_manager.get_allowed_profiles(client_id)
    allowed = any(
        auth_manager.profile_allows_skill(p, tool, file)
        for p in allowed_profiles
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Skill not allowed for this client")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Skill not found")

    with open(file_path, "r") as f:
        content = f.read()

    return PlainTextResponse(content=content)
