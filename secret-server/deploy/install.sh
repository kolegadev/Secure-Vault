#!/bin/bash
set -e

INSTALL_DIR="/opt/secret-server"
SERVICE_USER="secretserver"
SIGNING_USER="signingagent"

echo "Installing OpenClaw Secret Server..."

# Create users
if ! id -u "$SERVICE_USER" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

if ! id -u "$SIGNING_USER" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SIGNING_USER"
fi

# Create install directory
mkdir -p "$INSTALL_DIR"
cp -r . "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Ensure deploy scripts are executable
chmod +x deploy/health-check.py

# Create virtual environment
python3 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install -r requirements.txt

# Install systemd services
cp deploy/secret-server.service /etc/systemd/system/
cp deploy/signing-agent.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable secret-server.service
systemctl enable signing-agent.service

echo "Installation complete."
echo "Startup order:"
echo "  tailscaled → openclaw-vault (mount) → secret-server → signing-agent"
echo ""
echo "Start services with:"
echo "  systemctl start openclaw-vault.service"
echo "  systemctl start secret-server.service"
echo "  systemctl start signing-agent.service"
