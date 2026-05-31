import pytest
from eth_keys import keys

from secret_server.signing.agent import Signer


def test_sign_computes_ecdsa(tmp_path):
    key_file = tmp_path / "test.key"
    private_key_hex = "11" * 32
    key_file.write_text(private_key_hex)

    signer = Signer(str(tmp_path), "")
    payload_hash = "22" * 32
    result = signer.sign("test", payload_hash)

    # Should be 0x + r(64) + s(64) + v(2) = 132 chars
    assert result.startswith("0x")
    assert len(result) == 132

    # Verify signature cryptographically
    pk = keys.PrivateKey(bytes.fromhex(private_key_hex))
    digest = bytes.fromhex(payload_hash)
    sig_r = int(result[2:66], 16)
    sig_s = int(result[66:130], 16)
    sig_v = int(result[130:], 16)

    from eth_keys.datatypes import Signature

    signature = Signature(vrs=(sig_v - 27, sig_r, sig_s))
    assert pk.public_key.verify_msg_hash(digest, signature)


def test_sign_with_0x_prefix_key(tmp_path):
    key_file = tmp_path / "test.key"
    key_file.write_text("0x" + "11" * 32)
    signer = Signer(str(tmp_path), "")
    result = signer.sign("test", "22" * 32)
    assert result.startswith("0x")
    assert len(result) == 132


def test_sign_with_0x_prefix_payload(tmp_path):
    key_file = tmp_path / "test.key"
    key_file.write_text("11" * 32)
    signer = Signer(str(tmp_path), "")
    result = signer.sign("test", "0x" + "22" * 32)
    assert result.startswith("0x")
    assert len(result) == 132


def test_sign_file_not_found(tmp_path):
    signer = Signer(str(tmp_path), "")
    with pytest.raises(FileNotFoundError):
        signer.sign("missing", "payload123")


def test_sign_invalid_key_length(tmp_path):
    key_file = tmp_path / "test.key"
    key_file.write_text("tooshort")
    signer = Signer(str(tmp_path), "")
    with pytest.raises(ValueError, match="64 hex chars"):
        signer.sign("test", "22" * 32)


def test_sign_invalid_payload_hash(tmp_path):
    key_file = tmp_path / "test.key"
    key_file.write_text("11" * 32)
    signer = Signer(str(tmp_path), "")
    with pytest.raises(ValueError, match="Invalid payload_hash"):
        signer.sign("test", "notahex")
