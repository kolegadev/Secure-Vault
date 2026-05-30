#!/bin/bash
#
# OpenClaw Secure Vault — LUKS to VeraCrypt Migration Script
# =============================================================================
# One-time migration tool that:
#   1. Mounts the existing LUKS volume.
#   2. Copies all data to a temporary secure backup.
#   3. Verifies backup integrity (file count + SHA-256 checksums).
#   4. Formats the USB device as a VeraCrypt volume with exFAT inner filesystem.
#   5. Mounts the new VeraCrypt volume.
#   6. Restores data into the canonical V2 directory structure.
#   7. Generates vault-manifest.json if missing.
#   8. Validates the restored vault using VeraCryptProvider.validateVaultStructure.
#   9. Prompts before deleting the temporary backup.
#
# Security rules:
#   - Passphrases are read interactively with `read -s` (no echo).
#   - Passphrases are NEVER passed as command-line arguments.
#   - Passphrases are NEVER logged.
#
# Usage:
#   sudo ./migrate-luks-to-veracrypt.sh -d /dev/sdX1
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  echo "[ERROR] $*" >&2
  exit 1
}

warn() {
  echo "[WARN] $*" >&2
}

# Check if running as root (required for cryptsetup, veracrypt, mkfs)
if [ "$EUID" -ne 0 ]; then
  error "This script must be run as root (sudo)."
fi

# Script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Defaults
DEVICE=""
LUKS_MOUNT="/mnt/sv-migrate-luks"
VC_MOUNT="/mnt/securevault"
TMP_DIR=""
LUKS_PASS=""
VC_PASS=""
KEEP_BACKUP=false

# Temporary mapper name for LUKS during migration
LUKS_MAPPER="sv-migrate-luks"

# -----------------------------------------------------------------------------
# Argument parsing
# -----------------------------------------------------------------------------
usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Required:
  -d, --device PATH       Block device path of the LUKS USB (e.g., /dev/sdb1)

Optional:
  -m, --luks-mount DIR    Temp mount point for LUKS. Default: /mnt/sv-migrate-luks
  -v, --vc-mount DIR      Mount point for new VeraCrypt volume. Default: /mnt/securevault
  -t, --tmp-dir DIR       Explicit temporary backup directory.
                          Default: /tmp/sv-migrate-<timestamp>
  -k, --keep-backup       Keep the temporary backup without prompting.
  -h, --help              Show this help message

Example:
  sudo $(basename "$0") -d /dev/sdb1
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--device)
      DEVICE="$2"
      shift 2
      ;;
    -m|--luks-mount)
      LUKS_MOUNT="$2"
      shift 2
      ;;
    -v|--vc-mount)
      VC_MOUNT="$2"
      shift 2
      ;;
    -t|--tmp-dir)
      TMP_DIR="$2"
      shift 2
      ;;
    -k|--keep-backup)
      KEEP_BACKUP=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      ;;
  esac
done

if [[ -z "$DEVICE" ]]; then
  usage
  error "Device path is required (-d /dev/sdX1)."
fi

if [[ ! -b "$DEVICE" ]]; then
  error "Not a block device: $DEVICE"
fi

# Generate default backup dir if not provided
if [[ -z "$TMP_DIR" ]]; then
  TMP_DIR="/tmp/sv-migrate-$(date +%Y%m%d-%H%M%S)"
fi

# -----------------------------------------------------------------------------
# Dependency checks
# -----------------------------------------------------------------------------
command -v cryptsetup >/dev/null 2>&1 || error "cryptsetup is required but not installed."
command -v veracrypt >/dev/null 2>&1 || error "veracrypt is required but not installed."
command -v sha256sum >/dev/null 2>&1 || error "sha256sum is required but not installed."
command -v mkfs.exfat >/dev/null 2>&1 || command -v mkexfatfs >/dev/null 2>&1 || warn "exfat formatting tool not found; VeraCrypt may still format internally."

# -----------------------------------------------------------------------------
# Secure password input
# -----------------------------------------------------------------------------
read_secure() {
  local prompt="$1"
  local varname="$2"
  local value
  while true; do
    read -rsp "$prompt" value
    echo >&2
    if [[ -n "$value" ]]; then
      printf -v "$varname" '%s' "$value"
      break
    else
      warn "Passphrase cannot be empty. Please try again."
    fi
  done
}

log "=== OpenClaw Secure Vault Migration: LUKS -> VeraCrypt ==="
log ""

read_secure "Enter current LUKS passphrase: " LUKS_PASS
read_secure "Enter new VeraCrypt passphrase: " VC_PASS

read_secure "Re-enter new VeraCrypt passphrase: " vc_confirm
if [[ "$VC_PASS" != "$vc_confirm" ]]; then
  error "VeraCrypt passphrases do not match."
fi

# -----------------------------------------------------------------------------
# Step 1: Mount current LUKS volume
# -----------------------------------------------------------------------------
log "Step 1/10 — Mounting LUKS volume..."

# Ensure device is not already mounted or in use
if mountpoint -q "$LUKS_MOUNT" 2>/dev/null; then
  error "LUKS mount point is already in use: $LUKS_MOUNT"
fi

if mount | grep -q "^$DEVICE "; then
  error "Device $DEVICE is already mounted elsewhere. Please unmount first."
fi

mkdir -p "$LUKS_MOUNT"

if ! cryptsetup isLuks "$DEVICE" 2>/dev/null; then
  error "Device does not appear to be a LUKS volume: $DEVICE"
fi

# Open LUKS (password via builtin printf, never in ps)
if ! printf '%s\n' "$LUKS_PASS" | cryptsetup open "$DEVICE" "$LUKS_MAPPER" --type luks2; then
  error "Failed to open LUKS device. Wrong passphrase?"
fi

# Mount
if ! mount "/dev/mapper/$LUKS_MAPPER" "$LUKS_MOUNT"; then
  cryptsetup close "$LUKS_MAPPER" || true
  error "Failed to mount LUKS volume."
fi

log "LUKS volume mounted at $LUKS_MOUNT"

# -----------------------------------------------------------------------------
# Step 2: Copy all contents to temporary secure backup
# -----------------------------------------------------------------------------
log "Step 2/10 — Copying contents to temporary backup: $TMP_DIR"

mkdir -p "$TMP_DIR"
# Use cp -a to preserve permissions, timestamps, symlinks, etc.
if ! cp -a "$LUKS_MOUNT"/. "$TMP_DIR"/; then
  umount "$LUKS_MOUNT" || true
  cryptsetup close "$LUKS_MAPPER" || true
  error "Backup copy failed."
fi

# Secure permissions on backup
chmod -R 700 "$TMP_DIR"

log "Backup complete."

# -----------------------------------------------------------------------------
# Step 3: Verify backup integrity
# -----------------------------------------------------------------------------
log "Step 3/10 — Verifying backup integrity..."

SRC_COUNT=$(find "$LUKS_MOUNT" -type f | wc -l)
BK_COUNT=$(find "$TMP_DIR" -type f | wc -l)

if [[ "$SRC_COUNT" -ne "$BK_COUNT" ]]; then
  umount "$LUKS_MOUNT" || true
  cryptsetup close "$LUKS_MAPPER" || true
  error "File count mismatch: source=$SRC_COUNT backup=$BK_COUNT"
fi

log "File counts match: $SRC_COUNT"

# Checksums
CHECKSUM_SRC="/tmp/sv-migrate-src-$$.sha256"
CHECKSUM_BK="/tmp/sv-migrate-bk-$$.sha256"

(cd "$LUKS_MOUNT" && find . -type f -exec sha256sum {} \; | sort) > "$CHECKSUM_SRC"
(cd "$TMP_DIR" && find . -type f -exec sha256sum {} \; | sort) > "$CHECKSUM_BK"

if ! diff -q "$CHECKSUM_SRC" "$CHECKSUM_BK" >/dev/null; then
  rm -f "$CHECKSUM_SRC" "$CHECKSUM_BK"
  umount "$LUKS_MOUNT" || true
  cryptsetup close "$LUKS_MAPPER" || true
  error "SHA-256 checksum mismatch between source and backup."
fi

rm -f "$CHECKSUM_SRC" "$CHECKSUM_BK"
log "SHA-256 checksums match. Backup is verified."

# -----------------------------------------------------------------------------
# Step 4: Unmount and close LUKS (prepare for reformat)
# -----------------------------------------------------------------------------
log "Step 4/10 — Unmounting and closing LUKS..."

if ! umount "$LUKS_MOUNT"; then
  error "Failed to unmount LUKS volume. Close any open files and retry."
fi

if ! cryptsetup close "$LUKS_MAPPER"; then
  error "Failed to close LUKS mapper."
fi

log "LUKS volume unmounted and closed."

# -----------------------------------------------------------------------------
# Step 5: Create VeraCrypt volume
# -----------------------------------------------------------------------------
log "Step 5/10 — Creating VeraCrypt volume on $DEVICE..."
log "  Encryption: AES | Hash: SHA-512 | Filesystem: exFAT | Size: entire device"

# VeraCrypt text-mode creation reads prompts from stdin.
# We pipe: password, password-confirm, empty PIM.
# If this fails, the user can create the volume manually and re-run.
if ! printf '%s\n%s\n\n' "$VC_PASS" "$VC_PASS" | veracrypt -t --create "$DEVICE" \
    --volume-type=normal \
    --encryption=AES \
    --hash=sha-512 \
    --filesystem=exfat \
    --size=0 \
    --random-source=/dev/urandom; then

  warn "Automatic VeraCrypt volume creation failed."
  warn "You can create it manually with:"
  warn "  veracrypt -t --create $DEVICE --volume-type=normal --encryption=AES --hash=sha-512 --filesystem=exfat --size=0"
  warn "Then mount it to $VC_MOUNT and copy the contents from $TMP_DIR manually."
  error "Aborting. Temporary backup preserved at: $TMP_DIR"
fi

log "VeraCrypt volume created successfully."

# -----------------------------------------------------------------------------
# Step 6: Mount new VeraCrypt volume
# -----------------------------------------------------------------------------
log "Step 6/10 — Mounting new VeraCrypt volume..."

mkdir -p "$VC_MOUNT"

if ! printf '%s\n' "$VC_PASS" | veracrypt -t --mount "$DEVICE" "$VC_MOUNT" --stdin; then
  error "Failed to mount new VeraCrypt volume."
fi

log "VeraCrypt volume mounted at $VC_MOUNT"

# -----------------------------------------------------------------------------
# Step 7: Restore canonical directory structure
# -----------------------------------------------------------------------------
log "Step 7/10 — Restoring directory structure..."

# Create canonical V2 directories
mkdir -p "$VC_MOUNT"/{config,secrets,skills,crypto,exports,audit}

# Migrate legacy directories into canonical structure
if [[ -d "$TMP_DIR/env" ]]; then
  cp -a "$TMP_DIR/env"/. "$VC_MOUNT/secrets/"
  log "  Migrated env/ -> secrets/"
fi

if [[ -d "$TMP_DIR/services" ]]; then
  cp -a "$TMP_DIR/services"/. "$VC_MOUNT/config/"
  log "  Migrated services/ -> config/"
fi

if [[ -d "$TMP_DIR/skills" ]]; then
  cp -a "$TMP_DIR/skills"/. "$VC_MOUNT/skills/"
  log "  Migrated skills/ -> skills/"
fi

if [[ -d "$TMP_DIR/exports" ]]; then
  cp -a "$TMP_DIR/exports"/. "$VC_MOUNT/exports/"
  log "  Migrated exports/ -> exports/"
fi

# Copy remaining top-level files (excluding dirs we already migrated)
for item in "$TMP_DIR"/*; do
  [[ -e "$item" ]] || continue
  basename_item=$(basename "$item")

  # Skip directories we already handled
  case "$basename_item" in
    env|services|skills|exports) continue ;;
  esac

  if [[ -d "$item" ]]; then
    cp -a "$item" "$VC_MOUNT/"
    log "  Copied directory: $basename_item"
  else
    cp -a "$item" "$VC_MOUNT/"
    log "  Copied file: $basename_item"
  fi
done

# Set reasonable permissions (exFAT doesn't support Unix permissions,
# but we set them on the mount point for future-proofing)
chmod -R 755 "$VC_MOUNT" 2>/dev/null || true

log "Directory structure restored."

# -----------------------------------------------------------------------------
# Step 8: Generate vault-manifest.json if missing
# -----------------------------------------------------------------------------
log "Step 8/10 — Generating vault-manifest.json..."

MANIFEST_PATH="$VC_MOUNT/vault-manifest.json"
if [[ ! -f "$MANIFEST_PATH" ]]; then
  cat > "$MANIFEST_PATH" <<EOF
{
  "version": "2.0.0",
  "provider": "veracrypt",
  "migratedFrom": "luks",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "directories": [
    "config",
    "secrets",
    "skills",
    "crypto",
    "exports",
    "audit"
  ]
}
EOF
  log "  Created new vault-manifest.json"
else
  log "  vault-manifest.json already exists — preserving."
fi

# -----------------------------------------------------------------------------
# Step 9: Validate restored vault
# -----------------------------------------------------------------------------
log "Step 9/10 — Validating restored vault with VeraCryptProvider..."

if [[ -f "$PROJECT_DIR/bin/validate-migration.mjs" ]]; then
  if ! node "$PROJECT_DIR/bin/validate-migration.mjs" "$VC_MOUNT"; then
    warn "Validation reported errors. Please review the output above."
    warn "Backup preserved at: $TMP_DIR"
    exit 1
  fi
else
  warn "validate-migration.mjs not found. Skipping automated validation."
  warn "Please validate manually that these directories exist:"
  warn "  $VC_MOUNT/{config,secrets,skills,crypto,exports,audit}"
fi

log "Validation complete."

# -----------------------------------------------------------------------------
# Step 10: Prompt before deleting temporary backup
# -----------------------------------------------------------------------------
log "Step 10/10 — Cleanup"

if [[ "$KEEP_BACKUP" == true ]]; then
  log "Backup retained at: $TMP_DIR"
else
  read -rp "Delete temporary backup at $TMP_DIR? [y/N] " confirm
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    rm -rf "$TMP_DIR"
    log "Temporary backup deleted."
  else
    log "Backup preserved at: $TMP_DIR"
  fi
fi

log ""
log "========================================"
log "Migration complete!"
log "========================================"
log ""
log "Next steps:"
log "1. Update your backend/.env to set VAULT_PROVIDER=veracrypt"
log "2. Update backend/config/default.json paths if needed (envDir->secretsDir, servicesDir->configDir)"
log "3. Unmount when done: veracrypt -t --dismount $VC_MOUNT"
log "4. Test mounting on Linux, macOS, and Windows before deleting any LUKS backups."
log ""
