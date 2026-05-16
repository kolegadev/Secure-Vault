#!/bin/bash
set -euo pipefail

# OpenClaw Secure Vault Backup Utility

VAULT_DEVICE="${VAULT_DEVICE:-/dev/sdb1}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/openclaw-backups}"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "Backing up LUKS header..."
sudo cryptsetup luksHeaderBackup "$VAULT_DEVICE" --header-backup-file "$BACKUP_DIR/luks-header-$DATE.bin"

echo "Creating full disk image (this may take a while)..."
sudo dd if="$VAULT_DEVICE" of="$BACKUP_DIR/vault-full-$DATE.img" bs=4M status=progress || true

echo "Backup complete: $BACKUP_DIR"
ls -lh "$BACKUP_DIR"
