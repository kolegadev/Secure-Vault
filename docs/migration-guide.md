# LUKS to VeraCrypt Migration Guide

## Overview

This guide covers the one-time migration from a LUKS-encrypted USB vault (V1) to a VeraCrypt-encrypted USB vault (V2).

After migration, the USB vault will be mountable on Linux, macOS, and Windows without requiring the LUKS/cryptsetup toolchain.

## Prerequisites

- Linux machine with the following installed:
  - `cryptsetup`
  - `veracrypt` (CLI)
  - `sha256sum` (usually provided by `coreutils`)
  - `mkfs.exfat` or `mkexfatfs` (from `exfatprogs` or `exfat-utils`)
- Root access.
- A backup of critical data (the migration script also creates a temporary local backup).

## Migration Steps

### 1. Stop the Secure Vault service

```bash
sudo systemctl stop openclaw-vault
```

### 2. Run the migration script

```bash
cd /opt/openclaw-vault
sudo ./bin/migrate-luks-to-veracrypt.sh -d /dev/sdX1
```

Replace `/dev/sdX1` with your actual LUKS device path.

The script will:
1. Mount the LUKS volume.
2. Copy all contents to `/tmp/sv-migrate-<timestamp>/`.
3. Verify file counts and SHA-256 checksums.
4. Create a new VeraCrypt volume with an **exFAT** inner filesystem.
5. Restore data into the canonical V2 directory structure.
6. Generate `vault-manifest.json`.
7. Validate the restored vault using `VeraCryptProvider.validateVaultStructure`.
8. Prompt you before deleting the temporary backup.

### 3. Follow the interactive prompts

- Enter your current **LUKS passphrase**.
- Enter and confirm your new **VeraCrypt passphrase**.

Passphrases are read securely (no echo) and are **never** passed as command-line arguments or written to logs.

### 4. Verify the migration

The script performs automated validation, but you should also manually inspect the mount point:

```bash
ls -la /mnt/securevault
```

Expected structure:

```
/mnt/securevault
├── config/
├── secrets/
├── skills/
├── crypto/
├── exports/
├── audit/
└── vault-manifest.json
```

Legacy directories are mapped automatically:

| Legacy V1 path | V2 canonical path |
|----------------|-------------------|
| `env/`         | `secrets/`        |
| `services/`    | `config/`         |
| `skills/`      | `skills/`         |
| `exports/`     | `exports/`        |

### 5. Cross-platform validation

**Do not delete the temporary backup until the new volume has been validated on every platform you intend to use.**

- **Linux**
  ```bash
  sudo veracrypt -t --mount /dev/sdX1 /mnt/securevault
  ```

- **macOS**
  Install VeraCrypt, then mount the device to `/Volumes/SecureVault`.

- **Windows**
  Use VeraCrypt to mount the device as drive `S:` (or your preferred letter).

On each platform, confirm that:
- The volume mounts without errors.
- All files are readable.
- The directory structure is intact.

### 6. Update configuration

Edit `backend/.env` (or your environment) and set:

```bash
VAULT_PROVIDER=veracrypt
```

If you are proceeding with Epic D (Local SecureVault Mode), update `backend/config/default.json` to use the canonical directory keys:

```json
{
  "paths": {
    "vaultDb": "vault.db",
    "configDir": "config",
    "secretsDir": "secrets",
    "skillsDir": "skills",
    "exportsDir": "exports"
  }
}
```

> **Note:** The full config migration (envDir → secretsDir, servicesDir → configDir) is handled in Epic D. Only change these values if you are ready to integrate the new paths into the application layer.

### 7. Restart the service

```bash
sudo systemctl start openclaw-vault
```

## Troubleshooting

### VeraCrypt volume creation fails

Some VeraCrypt builds have slightly different text-mode prompts. If the automated creation step fails, create the volume manually:

```bash
sudo veracrypt -t --create /dev/sdX1 \
  --volume-type=normal \
  --encryption=AES \
  --hash=sha-512 \
  --filesystem=exfat \
  --size=0
```

Then mount it and copy the contents from your temporary backup (`/tmp/sv-migrate-<timestamp>`).

### exFAT not available

Install the exFAT utilities:

```bash
# Debian / Ubuntu / Raspberry Pi OS
sudo apt-get install exfatprogs

# Or the older package
sudo apt-get install exfat-utils
```

### Backup verification fails

If the SHA-256 checksums do not match, **do not proceed**. The source LUKS volume may have filesystem errors.

1. Re-mount the LUKS volume.
2. Run a filesystem check:
   ```bash
   sudo fsck /dev/mapper/openclaw-vault
   ```
3. Retry the migration.

### Validation script fails to import backend modules

`bin/validate-migration.mjs` imports `VeraCryptProvider` from the backend. If `node_modules` are missing or native modules (e.g., `better-sqlite3`) are not compiled, the import will fail. On the target deployment machine, ensure dependencies are installed:

```bash
cd /opt/openclaw-vault
npm run install:all
```

If the import still fails, perform manual validation by checking that the directories listed in Step 4 exist and that `vault-manifest.json` is readable.

## Post-Migration Checklist

- [ ] Temporary backup verified against source (file count + checksums).
- [ ] VeraCrypt volume mounts successfully on Linux.
- [ ] VeraCrypt volume mounts successfully on macOS (if applicable).
- [ ] VeraCrypt volume mounts successfully on Windows (if applicable).
- [ ] `vault-manifest.json` is present and readable.
- [ ] `VAULT_PROVIDER=veracrypt` is set in the environment.
- [ ] Temporary backup deleted after successful cross-platform validation.
- [ ] Old LUKS header backup archived separately (optional but recommended).
