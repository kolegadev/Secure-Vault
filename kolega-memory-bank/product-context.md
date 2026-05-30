# Product Context

## Problem Statement
Developers running agentic systems like OpenClaw on a local Raspberry Pi 5 face several challenges:
- Maintaining `.env` files in plaintext on the Pi's SD card (vulnerable to physical extraction)
- Scattering `SKILL.md` files across multiple directories without a unified view
- Manually editing Markdown files to update agent capabilities
- Lacking a portable, encrypted backup of the entire agent configuration
- Being locked into Linux-only LUKS encryption when they also work on macOS and Windows

## Why VeraCrypt on USB 3.0
1. **Cross-platform portability**: VeraCrypt volumes mount on Linux, macOS, and Windows without platform-specific tools
2. **Physical portability**: Unplug the drive and the entire agent configuration moves with you
3. **Hardware-grade encryption**: VeraCrypt with AES / SHA-512 provides full-disk encryption transparent to applications once mounted
4. **Atomic mount/dismount**: Secure the entire vault by dismounting the VeraCrypt volume, leaving no decrypted traces on host storage
5. **exFAT inner filesystem**: Maximizes cross-platform compatibility for file read/write operations

## Why Browser-Based Local Application
- Best balance of developer ergonomics and deployment simplicity
- Single-page application served locally at `http://localhost:3001`
- No Electron or Tauri bundling required
- Minimal deployment footprint

## Target User
Developers who manage infrastructure, not end users. The interface should feel like a developer tool:
- Monospaced fonts for variable names, file paths, and code blocks
- Dark mode by default
- Keyboard shortcuts for common actions
- Copy-to-clipboard buttons on every secret value
- Search and filter across all env vars, skills, and services

## Deployment Modes

### Local Mode (Primary)
The VeraCrypt USB is plugged directly into the developer's machine. The Express backend and React frontend run locally. No network access required.

### Pi5 Secret Server Mode (Optional)
The VeraCrypt USB stays plugged into a Raspberry Pi 5 on the same Tailscale network. Approved clients can fetch secrets and request signatures remotely, but private keys never leave the Pi.
