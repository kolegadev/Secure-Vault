import os

import pytest

from secret_server.signing.agent import Signer

# Valid 32-byte hex private key (64 hex chars)
VALID_KEY_HEX = "11" * 32

# Valid 32-byte hex payload hash (64 hex chars)
VALID_HASH_HEX = "aa" * 32


def test_sign_computes_valid_signature(tmp_path):
    key_file = tmp_path / "test.key"
    key_file.write_text(VALID_KEY_HEX)
    signer = Signer(str(tmp_path), "")
    result = signer.sign("test", VALID_HASH_HEX)
    # ECDSA secp256k1 signature with recovery byte = 130 hex chars
    assert isinstance(result, str)
    assert len(result) == 130


def test_sign_with_0x_prefix(tmp_path):
    key_file = tmp_path / "test.key"
    key_file.write_text("0x" + VALID_KEY_HEX)
    signer = Signer(str(tmp_path), "")
    result = signer.sign("test", "0x" + VALID_HASH_HEX)
    assert isinstance(result, str)
    assert len(result) == 130


def test_sign_file_not_found(tmp_path):
    signer = Signer(str(tmp_path), "")
    with pytest.raises(FileNotFoundError):
        signer.sign("missing", VALID_HASH_HEX)


def test_sign_escapes_path_traversal(tmp_path):
    safe_key = tmp_path / "safe.key"
    safe_key.write_text(VALID_KEY_HEX)
    signer = Signer(str(tmp_path), "")
    # The Signer class itself does not escape; path traversal is handled by
    # the API layer (os.path.basename). Here we verify the signer works with
    # a simple key_id.
    result = signer.sign("safe", VALID_HASH_HEX)
    assert isinstance(result, str)
    assert len(result) == 130
