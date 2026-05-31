import json
import os

import pytest
from fastapi.testclient import TestClient

from secret_server.config import Settings
from secret_server.main import create_app


@pytest.fixture
def client(tmp_path):
    vault = tmp_path / "vault"
    vault.mkdir()
    (vault / "vault-manifest.json").write_text('{"version":"2.0.0"}')

    crypto_dir = vault / "crypto"
    crypto_dir.mkdir()
    (crypto_dir / "polymarket.key").write_text("aa" * 32)
    (crypto_dir / "test.key").write_text("bb" * 32)

    config_dir = vault / "config" / "auth"
    config_dir.mkdir(parents=True)
    profiles = {
        "clients": {
            "test-client": {
                "api_key": "test-key-123",
                "allowed_profiles": ["dev"],
                "can_sign": True,
                "is_admin": False,
            },
            "no-sign-client": {
                "api_key": "no-sign-key",
                "allowed_profiles": ["dev"],
                "can_sign": False,
                "is_admin": False,
            },
        },
        "profiles": {
            "dev": {
                "allowed_secrets": ["*"],
                "allowed_skills": ["*"],
            }
        },
    }
    (config_dir / "profiles.json").write_text(json.dumps(profiles))

    test_settings = Settings(
        tailscale_only=False,
        vault_mount_point=str(vault),
        log_level="DEBUG",
        use_signing_agent=False,
        signing_rate_limit_per_minute=10,
    )

    # Monkeypatch module-level settings objects so that submodules use test config
    import secret_server.api.signing as signing_mod
    signing_mod.settings = test_settings
    signing_mod.rate_limiter = signing_mod.RateLimiter(
        max_requests=test_settings.signing_rate_limit_per_minute,
        window_seconds=60,
    )
    import secret_server.api.health as health_mod
    health_mod.settings = test_settings
    import secret_server.auth.client_auth as auth_mod
    auth_mod.settings = test_settings
    import secret_server.vault.guard as guard_mod
    guard_mod.settings = test_settings
    import secret_server.signing.audit as audit_mod
    audit_mod.settings = test_settings

    # Reset auth manager so it reloads from our temp vault
    auth_mod.auth_manager._loaded = False

    app = create_app(test_settings)
    return TestClient(app)


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert data["tailscale_only"] is False


def test_sign_generic_no_api_key(client):
    response = client.post("/sign/test", json={"payload_hash": "abc123"})
    assert response.status_code == 422


def test_sign_generic_forbidden(client):
    response = client.post(
        "/sign/test",
        json={"payload_hash": "abc123"},
        headers={"X-API-Key": "no-sign-key"},
    )
    assert response.status_code == 403


def test_sign_generic_missing_payload_hash(client):
    response = client.post(
        "/sign/test",
        json={},
        headers={"X-API-Key": "test-key-123"},
    )
    assert response.status_code == 400


def test_sign_generic_success(client):
    response = client.post(
        "/sign/test",
        json={"payload_hash": "ab" * 32, "purpose": "unit-test"},
        headers={"X-API-Key": "test-key-123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "signature" in data
    assert data["signer"] == "test"
    assert len(data["signature"]) == 132


def test_sign_polymarket_success(client):
    response = client.post(
        "/sign/polymarket",
        json={"payload_hash": "cd" * 32, "market": "ETH-USD", "purpose": "trade"},
        headers={"X-API-Key": "test-key-123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "signature" in data
    assert data["signer"] == "polymarket"


def test_sign_generic_rate_limit(client):
    # Exhaust the limit
    for i in range(10):
        response = client.post(
            "/sign/test",
            json={"payload_hash": f"{i:064x}"},
            headers={"X-API-Key": "test-key-123"},
        )
        assert response.status_code == 200

    # Next request should be rate limited
    response = client.post(
        "/sign/test",
        json={"payload_hash": "0b" * 32},
        headers={"X-API-Key": "test-key-123"},
    )
    assert response.status_code == 429
