# VeraCrypt Setup Guide

## Overview

This guide covers installing and configuring VeraCrypt for headless (non-GUI) operation on Linux, macOS, and Windows. The Secure Vault V2 backend uses the VeraCrypt CLI exclusively—no GUI is required on the server.

## Linux (Raspberry Pi / Debian / Ubuntu)

### 1. Install VeraCrypt

Download the latest VeraCrypt console-only binary from the [VeraCrypt downloads page](https://www.veracrypt.fr/en/Downloads.html) or install via package manager where available:

```bash
# Raspberry Pi OS / Debian / Ubuntu (if available in repos)
sudo apt-get update
sudo apt-get install veracrypt

# Or download the generic installer for ARM64/x64
wget https://launchpad.net/veracrypt/trunk/1.26.14/+download/veracrypt-1.26.14-console-arm64.tar.gz
tar xzf veracrypt-1.26.14-console-arm64.tar.gz
sudo mv veracrypt /usr/bin/veracrypt
sudo chmod +x /usr/bin/veracrypt
```

### 2. Verify Installation

```bash
veracrypt --text --version
```

### 3. Install Secure Sudo Wrappers (Recommended)

The project includes hardened wrapper scripts to avoid granting blanket `sudo` access to `veracrypt`:

```bash
sudo bash bin/setup.sh
```

This installs:
- `/usr/local/bin/securevault-veracrypt-mount`
- `/usr/local/bin/securevault-veracrypt-unmount`

And configures `sudoers` so the `openclaw-vault` service user can run only these wrappers as root.

### 4. Test Mount a Volume

```bash
# Create a test volume (interactive)
sudo veracrypt -t --create /dev/sdX1 \
  --volume-type=normal \
  --encryption=AES \
  --hash=sha-512 \
  --filesystem=exfat \
  --size=0

# Mount it
sudo veracrypt -t --mount /dev/sdX1 /mnt/securevault --stdin <<EOF
your-password-here
EOF

# Verify
ls -la /mnt/securevault

# Dismount
sudo veracrypt -t --dismount /mnt/securevault
```

## macOS

### 1. Install VeraCrypt

Download `VeraCrypt_1.26.14.dmg` from the official site and drag the app to `/Applications`.

The CLI binary is located at:
```
/Applications/VeraCrypt.app/Contents/MacOS/VeraCrypt
```

### 2. Allow macOS to Run the Binary

System Preferences → Security & Privacy → General → Allow VeraCrypt.

### 3. Test Mount

```bash
/Applications/VeraCrypt.app/Contents/MacOS/VeraCrypt -t --mount /dev/disk2 /Volumes/SecureVault --stdin <<EOF
your-password-here
EOF
```

## Windows

### 1. Install VeraCrypt

Download the installer from the official site and run it. Ensure the `VeraCrypt.exe` binary is added to your system `PATH`.

### 2. Test Mount from PowerShell

```powershell
# Mount to drive S:
VeraCrypt.exe /text /mount \\Device\Harddisk1\Partition1 S: /stdin
# Enter password interactively
```

## Troubleshooting

### `veracrypt: command not found`
- Ensure the binary is in your `PATH` or use the full path.
- On Linux, the binary may be named `veracrypt-console` in some distributions.

### `Permission denied` on mount
- Linux: use the secure sudo wrappers or run as root.
- macOS: grant Full Disk Access to Terminal/Terminal Emulator in System Preferences.

### Volume creation hangs
- Some VeraCrypt console builds prompt for entropy collection. If running headless, use `--random-source=/dev/urandom` or ensure an active entropy source.

## Security Notes

- **Never** pass `-p` or `--password` on the command line.
- The Secure Vault backend always uses `--stdin` for password input.
- After mount operations, verify `ps aux | grep veracrypt` contains no password strings.
