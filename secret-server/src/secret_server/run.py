import sys

import uvicorn

from .config import get_tailscale_ip, settings


def main() -> None:
    host = settings.host
    if settings.tailscale_only:
        ts_ip = get_tailscale_ip()
        if not ts_ip:
            print("Tailscale IP not found. Refusing to start.", file=sys.stderr)
            sys.exit(1)
        host = ts_ip

    uvicorn.run(
        "secret_server.main:app",
        host=host,
        port=settings.port,
        log_level=settings.log_level.lower(),
        access_log=False,
    )


if __name__ == "__main__":
    main()
