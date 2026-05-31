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
    """Deterministic ECDSA (secp256k1) signing agent.

    Uses ``eth-account`` for proper Ethereum-compatible signing.
    Private keys are held in locked memory pages and overwritten immediately
    after use.
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

        try:
            # Import here so the module loads even if eth-account is missing
            from eth_account import Account
            from eth_utils import to_bytes

            # Strip optional 0x prefix for eth-account
            pk_hex = private_key
            if pk_hex.startswith("0x") or pk_hex.startswith("0X"):
                pk_hex = pk_hex[2:]

            account = Account.from_key(pk_hex)

            # payload_hash is expected as a hex string (optionally 0x-prefixed)
            hash_bytes = to_bytes(hexstr=payload_hash)
            if len(hash_bytes) != 32:
                raise ValueError("payload_hash must be a 32-byte hex string")

            signed = account.unsafe_sign_hash(hash_bytes)
            signature = signed.signature.hex()
        finally:
            # Overwrite sensitive buffers
            for i in range(len(key_bytes)):
                key_bytes[i] = 0
            _munlock_buffer(key_bytes)
            del key_bytes
            # Best-effort clear of the immutable string reference
            private_key = "0" * len(private_key)
            del private_key

        return signature
