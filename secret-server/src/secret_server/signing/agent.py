import ctypes
import hashlib
import hmac
import os
import sys


def _mlock_buffer(buf: bytearray) -> bool:
    """Best-effort memory lock for Linux."""
    if sys.platform != "linux":
        return False
    try:
        libc = ctypes.CDLL("libc.so.6")
        ptr = ctypes.addressof(ctypes.c_char.from_buffer(buf))
        ret = libc.mlock(ctypes.c_void_p(ptr), ctypes.c_size_t(len(buf)))
        return ret == 0
    except Exception:
        return False


def _munlock_buffer(buf: bytearray) -> bool:
    if sys.platform != "linux":
        return False
    try:
        libc = ctypes.CDLL("libc.so.6")
        ptr = ctypes.addressof(ctypes.c_char.from_buffer(buf))
        ret = libc.munlock(ctypes.c_void_p(ptr), ctypes.c_size_t(len(buf)))
        return ret == 0
    except Exception:
        return False


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

        key_bytes = bytearray(private_key.encode("utf-8"))
        _mlock_buffer(key_bytes)
        payload_bytes = bytearray(payload_hash.encode("utf-8"))
        try:
            sig = hmac.new(
                key_bytes,
                payload_bytes,
                hashlib.sha256,
            ).hexdigest()
        finally:
            # Overwrite sensitive buffers
            for i in range(len(key_bytes)):
                key_bytes[i] = 0
            _munlock_buffer(key_bytes)
            del key_bytes
            del payload_bytes
            # Best-effort clear of the immutable string reference
            private_key = "0" * len(private_key)
            del private_key

        return sig
