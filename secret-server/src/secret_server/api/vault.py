from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from ..auth.client_auth import require_api_key
from ..vault.guard import require_vault_mounted
from ..vault.veracrypt import VeraCryptVault

router = APIRouter()


@router.get("/status")
async def vault_status(
    vault: str = Depends(require_vault_mounted),
) -> JSONResponse:
    vc = VeraCryptVault()
    manifest = vc.read_manifest()
    return JSONResponse(
        content={
            "mounted": True,
            "mount_path": vc.mount_point,
            "vault_id": manifest.get("vault_id") if manifest else None,
            "manifest_valid": manifest is not None,
        }
    )
