#!/bin/bash
set -euo pipefail

# OpenClaw Secure Vault Setup Script
# Run as root on Raspberry Pi OS (Bookworm, 64-bit)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VAULT_USER="openclaw-vault"
MOUNT_POINT="/mnt/openclaw-vault"
APP_DIR="/opt/openclaw-vault"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  echo "[ERROR] $*" >&2
  exit 1
}

# Check root
if [ "$EUID" -ne 0 ]; then
  error "Please run as root (sudo)"
fi

log "Starting OpenClaw Secure Vault setup..."

# 1. Install system dependencies
log "Installing system dependencies..."
apt-get update
apt-get install -y \
  cryptsetup \
  cryptsetup-bin \
  udisks2 \
  curl \
  build-essential \
  git \
  sqlite3

# 2. Install Node.js 20.x if not present
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "20" ]; then
  log "Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

log "Node.js version: $(node -v)"
log "npm version: $(npm -v)"

# 3. Create dedicated service user
if ! id "$VAULT_USER" &>/dev/null; then
  log "Creating service user: $VAULT_USER"
  useradd --system --no-create-home --shell /bin/false "$VAULT_USER"
fi

# 4. Configure sudoers for cryptsetup/mount/umount
log "Configuring sudoers..."
SUDOERS_FILE="/etc/sudoers.d/99-openclaw-vault"
cat > "$SUDOERS_FILE" <<EOF
# OpenClaw Secure Vault — restricted sudo privileges
$VAULT_USER ALL=(root) NOPASSWD: /sbin/cryptsetup
$VAULT_USER ALL=(root) NOPASSWD: /bin/mount
$VAULT_USER ALL=(root) NOPASSWD: /bin/umount
$VAULT_USER ALL=(root) NOPASSWD: /usr/bin/mount
$VAULT_USER ALL=(root) NOPASSWD: /usr/bin/umount
EOF
chmod 440 "$SUDOERS_FILE"
visudo -c || error "sudoers syntax error"

# 5. Create mount point
mkdir -p "$MOUNT_POINT"

# 6. Install application
log "Installing application to $APP_DIR..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
cp -r "$PROJECT_DIR/"* "$APP_DIR/" || true
chown -R "$VAULT_USER:$VAULT_USER" "$APP_DIR"

# 7. Install dependencies and build
log "Installing dependencies..."
cd "$APP_DIR"
npm run install:all
npm run build

# 8. Install systemd service
log "Installing systemd service..."
cp "$APP_DIR/systemd/openclaw-vault.service" /etc/systemd/system/
systemctl daemon-reload

# 9. Create data directory
mkdir -p "$APP_DIR/backend/data"
chown -R "$VAULT_USER:$VAULT_USER" "$APP_DIR/backend/data"

# 10. Run database migrations
log "Running database migrations..."
cd "$APP_DIR/backend"
sudo -u "$VAULT_USER" npm run db:migrate

log ""
log "========================================"
log "Setup complete!"
log "========================================"
log ""
log "Next steps:"
log "1. Insert your USB drive and identify its device path (e.g., /dev/sda1)"
log "2. Update LUKS_DEVICE_PATH in $APP_DIR/backend/.env"
log "3. If using a specific USB serial, update the udev rule in $APP_DIR/bin/usb-inserted.sh"
log "4. Start the service: sudo systemctl start openclaw-vault"
log "5. Enable auto-start: sudo systemctl enable openclaw-vault"
log ""
log "Access the UI at: http://$(hostname -I | awk '{print $1}'):3001"
log ""
