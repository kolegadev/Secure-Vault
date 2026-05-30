#!/bin/bash
set -euo pipefail

INSTALL_DIR="/opt/secret-server"
SERVICE_FILE="/etc/systemd/system/secret-server.service"
USER_NAME="secretserver"

echo "==> Installing OpenClaw Secret Server..."

# Create dedicated user
if ! id -u "$USER_NAME" &>/dev/null; then
    sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$USER_NAME"
fi

# Copy application files
sudo mkdir -p "$INSTALL_DIR"
sudo cp -r src requirements.txt pyproject.toml README.md "$INSTALL_DIR/"

# Create virtual environment and install dependencies
sudo python3 -m venv "$INSTALL_DIR/venv"
sudo "$INSTALL_DIR/venv/bin/pip" install --upgrade pip
sudo "$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

# Set ownership
sudo chown -R "$USER_NAME:$USER_NAME" "$INSTALL_DIR"

# Install systemd service
sudo cp deploy/secret-server.service "$SERVICE_FILE"
sudo systemctl daemon-reload
sudo systemctl enable secret-server.service

echo "==> Installation complete."
echo "    Ensure the vault is mounted, then run:"
echo "    sudo systemctl start secret-server"
