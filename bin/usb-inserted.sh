#!/bin/bash
# USB Insertion Trigger Script
# Called by udev when the configured USB device is inserted.
# Place this in /usr/local/bin/ and reference it from a udev rule.

LOG_FILE="/var/log/openclaw-usb.log"
VAULT_USER="openclaw-vault"
APP_DIR="/opt/openclaw-vault"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

DEVICE_PATH="$1"
if [ -z "$DEVICE_PATH" ]; then
  log "ERROR: No device path provided"
  exit 1
fi

log "USB device inserted: $DEVICE_PATH"

# Example udev rule to install (adapt vendor/product IDs or serial as needed):
# ACTION=="add", SUBSYSTEM=="block", ENV{ID_SERIAL_SHORT}=="YOUR_SERIAL_HERE", RUN+="/usr/local/bin/openclaw-usb-inserted.sh /dev/%k"
#
# To install:
#   sudo cp bin/usb-inserted.sh /usr/local/bin/openclaw-usb-inserted.sh
#   sudo chmod +x /usr/local/bin/openclaw-usb-inserted.sh
#   sudo nano /etc/udev/rules.d/99-openclaw-vault.rules
#   sudo udevadm control --reload-rules

log "Trigger processed for $DEVICE_PATH"
