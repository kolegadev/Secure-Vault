import ctypes
import os
import re
import sys

from eth_keys import keys


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
    """ECDSA secp256k1 signing agent.

    Reads hex-encoded private keys from the vault filesystem, loads them into
    mlock'd memory, signs 32-byte keccak256 digests, and securely zeroes the
    key material immediately after use.

    The returned signature is a 65-byte hex string (0x + r + s + v) compatible
    with ethers.js and Polymarket CLOB.
    """

    def __init__(self, vault_path: str, crypto_dir: str):
        self.base_path = os.path.realpath(os.path.join(vault_path, crypto_dir))

    def _validate_key_id(self, key_id: str) -> None:
        """Validate key_id to prevent path traversal attacks."""
        if not key_id:
            raise ValueError("key_id cannot be empty")
        
        # Allow only alphanumeric characters and hyphens
        if not re.match(r'^[a-zA-Z0-9\-]+$', key_id):
            raise ValueError("key_id can only contain alphanumeric characters and hyphens")
        
        # Additional safety check - reject any key_id containing path components
        if '/' in key_id or '\\' in key_id or '..' in key_id:
            raise ValueError("key_id cannot contain path separators or relative path components")

    def _key_path(self, key_id: str) -> str:
        self._validate_key_id(key_id)
        key_path = os.path.realpath(os.path.join(self.base_path, f"{key_id}.key"))
        
        # Verify the resolved path is within the crypto directory
        try:
            common_path = os.path.commonpath([self.base_path, key_path])
            if common_path != self.base_path:
                raise ValueError(f"key_id resolves to path outside crypto directory")
        except ValueError:
            # commonpath can raise ValueError for paths on different drives (Windows)
            raise ValueError(f"key_id resolves to invalid path")
        
        return key_path

    def sign(self, key_id: str, payload_hash: str) -> str:
        key_path = self._key_path(key_id)
        if not os.path.exists(key_path):
            raise FileNotFoundError(f"Key file not found: {key_path}")

        with open(key_path, "r") as f:
            private_key = f.read().strip()

        # Strip optional 0x prefix and validate length
        key_hex = private_key[2:] if private_key.startswith("0x") else private_key
        if len(key_hex) != 64:
            raise ValueError(
                f"Private key must be 64 hex chars (32 bytes), got {len(key_hex)}"
            )

        key_bytes = bytearray.fromhex(key_hex)
        _mlock_buffer(key_bytes)

        # Normalize payload hash — strip 0x if present
        digest_hex = payload_hash[2:] if payload_hash.startswith("0x") else payload_hash
        try:
            digest_bytes = bytes.fromhex(digest_hex)
        except ValueError as exc:
            raise ValueError(f"Invalid payload_hash hex: {exc}")

        try:
            private_key_obj = keys.PrivateKey(bytes(key_bytes))
            signature = private_key_obj.sign_msg_hash(digest_bytes)
            # Convert recovery id (0/1) to Ethereum v (27/28) for ethers.js compat
            v = signature.v + 27
            sig_hex = (
                "0x"
                + f"{signature.r:064x}"
                + f"{signature.s:064x}"
                + f"{v:02x}"
            )
        finally:
            # Overwrite sensitive buffers
            for i in range(len(key_bytes)):
                key_bytes[i] = 0
            _munlock_buffer(key_bytes)
            del key_bytes
            del digest_bytes
            # Best-effort clear of the immutable string reference
            private_key = "0" * len(private_key)
            del private_key

        return sig_hex
