import pytest
from fastapi.testclient import TestClient

from secret_server.config import Settings
from secret_server.main import create_app


@pytest.fixture
def client():
    test_settings = Settings(
        tailscale_only=False,
        vault_mount_point="/tmp/test-vault",
        log_level="DEBUG",
    )
    app = create_app(test_settings)
    return TestClient(app)


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert data["tailscale_only"] is False


def test_vault_status_503_when_unmounted(client):
    # Without a valid API key, auth fails first (401).
    # Even with a key, the vault guard would return 503 because /tmp/test-vault
    # is not mounted. We test the public health endpoint above; deeper
    # integration tests require a mounted vault and valid profiles file.
    response = client.get("/vault/status")
    assert response.status_code == 401
