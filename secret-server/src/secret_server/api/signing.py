import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from ..auth.client_auth import auth_manager, require_api_key
from ..config import settings
from ..signing.agent import Signer
from ..signing.audit import log_signing_request
from ..vault.guard import require_vault_mounted

router = APIRouter()


@router.post("/polymarket")
async def sign_polymarket(
    request: dict,
    client_id: str = Depends(require_api_key),
    vault: str = Depends(require_vault_mounted),
):
    auth_manager.ensure_loaded()
    if not auth_manager.can_sign(client_id):
        raise HTTPException(status_code=403, detail="Signing not allowed for this client")

    payload_hash = request.get("payload_hash")
    market = request.get("market")
    purpose = request.get("purpose")

    if not payload_hash:
        raise HTTPException(status_code=400, detail="payload_hash is required")

    key_id = request.get("key_id", "polymarket")
    key_id = os.path.basename(key_id)

    signer = Signer(vault, settings.crypto_dir)
    try:
        signature = signer.sign(key_id, payload_hash)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Signing key not found")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Signing failed: {exc}")

    log_signing_request(client_id, key_id, market, purpose, payload_hash)

    return JSONResponse(content={"signature": signature, "signer": key_id})


@router.post("/{key_id}")
async def sign_generic(
    key_id: str,
    request: dict,
    client_id: str = Depends(require_api_key),
    vault: str = Depends(require_vault_mounted),
):
    auth_manager.ensure_loaded()
    if not auth_manager.can_sign(client_id):
        raise HTTPException(status_code=403, detail="Signing not allowed for this client")

    payload_hash = request.get("payload_hash")
    purpose = request.get("purpose")
    if not payload_hash:
        raise HTTPException(status_code=400, detail="payload_hash is required")

    key_id = os.path.basename(key_id)

    signer = Signer(vault, settings.crypto_dir)
    try:
        signature = signer.sign(key_id, payload_hash)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Signing key not found")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Signing failed: {exc}")

    log_signing_request(client_id, key_id, None, purpose, payload_hash)

    return JSONResponse(content={"signature": signature, "signer": key_id})
