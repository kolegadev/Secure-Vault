import asyncio
import json
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from ..auth.client_auth import auth_manager, require_api_key
from ..config import settings
from ..signing.audit import log_signing_request
from ..signing.rate_limiter import RateLimiter
from ..vault.guard import require_vault_mounted

router = APIRouter()

rate_limiter = RateLimiter(
    max_requests=settings.signing_rate_limit_per_minute,
    window_seconds=60,
)


async def _agent_sign(key_id: str, payload_hash: str) -> dict:
    """Forward signing request to the restricted signing agent subprocess."""
    if not settings.use_signing_agent:
        from ..signing.agent import Signer

        signer = Signer(settings.vault_mount_point, settings.crypto_dir)
        signature = signer.sign(key_id, payload_hash)
        return {"signature": signature, "signer": key_id}

    socket_path = settings.signing_agent_socket
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_unix_connection(socket_path),
            timeout=5.0,
        )
    except (OSError, asyncio.TimeoutError) as exc:
        raise HTTPException(
            status_code=503, detail=f"Signing agent unavailable: {exc}"
        )

    request = json.dumps({"key_id": key_id, "payload_hash": payload_hash}).encode()
    writer.write(request + b"\n")
    await writer.drain()

    try:
        response_line = await asyncio.wait_for(reader.readline(), timeout=10.0)
    except asyncio.TimeoutError:
        writer.close()
        raise HTTPException(status_code=503, detail="Signing agent timeout")

    writer.close()
    await writer.wait_closed()

    if not response_line:
        raise HTTPException(status_code=503, detail="Signing agent closed connection")

    try:
        data = json.loads(response_line.decode())
    except json.JSONDecodeError:
        raise HTTPException(status_code=503, detail="Invalid response from signing agent")

    if "error" in data:
        raise HTTPException(status_code=500, detail=data["error"])

    return data


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

    if not rate_limiter.is_allowed(client_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    key_id = os.path.basename(request.get("key_id", "polymarket"))

    result = await _agent_sign(key_id, payload_hash)
    signature = result["signature"]

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

    if not rate_limiter.is_allowed(client_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    key_id = os.path.basename(key_id)

    result = await _agent_sign(key_id, payload_hash)
    signature = result["signature"]

    log_signing_request(client_id, key_id, None, purpose, payload_hash)

    return JSONResponse(content={"signature": signature, "signer": key_id})
