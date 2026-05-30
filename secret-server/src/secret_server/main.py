import logging
import sys

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import Settings, get_tailscale_ip, settings
from .api import admin, health, secrets, signing, skills, vault as vault_api


def configure_logging(log_level: str) -> None:
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper(), logging.INFO),
    )


def create_app(settings_override: Settings = None) -> FastAPI:
    cfg = settings_override or settings
    configure_logging(cfg.log_level)

    app = FastAPI(
        title=cfg.app_name,
        version=cfg.version,
        docs_url=None,
        redoc_url=None,
    )

    @app.on_event("startup")
    async def startup_event() -> None:
        logger = structlog.get_logger()
        if cfg.tailscale_only:
            ts_ip = get_tailscale_ip()
            if not ts_ip:
                logger.error("Tailscale IP not found. Refusing to start.")
                sys.exit(1)
            logger.info("tailscale_ip_detected", ip=ts_ip)
        logger.info("secret_server_starting", port=cfg.port, host=cfg.host)

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger = structlog.get_logger()
        logger.error("unhandled_exception", path=request.url.path, error=str(exc))
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    app.include_router(health.router, tags=["Health"])
    app.include_router(vault_api.router, prefix="/vault", tags=["Vault"])
    app.include_router(skills.router, prefix="/skills", tags=["Skills"])
    app.include_router(secrets.router, prefix="/secrets", tags=["Secrets"])
    app.include_router(signing.router, prefix="/sign", tags=["Signing"])
    app.include_router(admin.router, prefix="/admin", tags=["Admin"])

    return app


app = create_app()
