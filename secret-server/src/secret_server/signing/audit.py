import json
import os
from datetime import datetime, timezone
from typing import Optional

from ..config import settings


def log_signing_request(
    client_id: str,
    key_id: str,
    market: Optional[str],
    purpose: Optional[str],
    payload_hash: str,
) -> None:
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "client_id": client_id,
        "key_id": key_id,
        "market": market,
        "purpose": purpose,
        "payload_hash": payload_hash,
    }

    audit_dir = os.path.join(settings.vault_mount_point, settings.audit_dir)
    os.makedirs(audit_dir, exist_ok=True)
    audit_file = os.path.join(audit_dir, "signing.log")

    with open(audit_file, "a") as f:
        f.write(json.dumps(entry) + "\n")
