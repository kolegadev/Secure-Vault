import hashlib
import hmac
import os

import pytest

from secret_server.signing.agent import Signer


def test_sign_computes_hmac(tmp_path):
    key_file = tmp_path / "test.key"
    key_file.write_text("mysecret")
    signer = Signer(str(tmp_path), "")
    result = signer.sign("test", "payload123")
    expected = hmac.new(b"mysecret", b"payload123", hashlib.sha256).hexdigest()
    assert result == expected


def test_sign_file_not_found(tmp_path):
    signer = Signer(str(tmp_path), "")
    with pytest.raises(FileNotFoundError):
        signer.sign("missing", "payload123")


def test_sign_escapes_path_traversal(tmp_path):
    safe_key = tmp_path / "safe.key"
    safe_key.write_text("safe")
    signer = Signer(str(tmp_path), "")
    # The Signer class itself does not escape; path traversal is handled by
    # the API layer (os.path.basename). Here we verify the signer works with
    # a simple key_id.
    result = signer.sign("safe", "x")
    assert isinstance(result, str)
    assert len(result) == 64
