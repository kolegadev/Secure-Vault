from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from ..auth.client_auth import auth_manager, require_api_key
from ..vault.guard import require_vault_mounted

router = APIRouter()


@router.post("/reload")
async def reload_config(
    client_id: str = Depends(require_api_key),
    vault: str = Depends(require_vault_mounted),
):
    auth_manager.ensure_loaded()
    if not auth_manager.is_admin(client_id):
        raise HTTPException(status_code=403, detail="Admin access required")

    auth_manager.reload()
    return JSONResponse(content={"detail": "Configuration reloaded"})
