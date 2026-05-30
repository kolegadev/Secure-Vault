from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..config import get_tailscale_ip, settings
from ..vault.guard import vault_status_dependency

router = APIRouter()


@router.get("/health")
async def health() -> JSONResponse:
    ts_ip = get_tailscale_ip()
    mounted = False
    try:
        status = await vault_status_dependency()
        mounted = status.get("mounted", False)
    except Exception:
        pass

    return JSONResponse(
        content={
            "status": "ok",
            "version": settings.version,
            "vault_mounted": mounted,
            "tailscale_only": settings.tailscale_only,
            "tailscale_ip": ts_ip,
        }
    )
