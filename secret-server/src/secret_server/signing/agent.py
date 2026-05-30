import hashlib
import hmac
import os


class Signer:
    """Deterministic signing agent.

    .. warning::
       The current implementation uses HMAC-SHA256 as a deterministic placeholder.
       Replace with proper ECDSA (secp256k1) or Ed25519 signing via the
       ``cryptography`` library for production blockchain use.
    """

    def __init__(self, vault_path: str, crypto_dir: str):
        self.base_path = os.path.join(vault_path, crypto_dir)

    def _key_path(self, key_id: str) -> str:
        return os.path.join(self.base_path, f"{key_id}.key")

    def sign(self, key_id: str, payload_hash: str) -> str:
        key_path = self._key_path(key_id)
        if not os.path.exists(key_path):
            raise FileNotFoundError(f"Key file not found: {key_path}")

        with open(key_path, "r") as f:
            private_key = f.read().strip()

        try:
            sig = hmac.new(
                private_key.encode("utf-8"),
                payload_hash.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
        finally:
            # Best-effort clear from memory
            private_key = "0" * len(private_key)
            del private_key

        return sig
