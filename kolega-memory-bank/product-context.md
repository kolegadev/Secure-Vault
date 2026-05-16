# Product Context

## Problem Statement
Developers running agentic systems like OpenClaw on a local Raspberry Pi 5 face several challenges:
- Maintaining `.env` files in plaintext on the Pi's SD card (vulnerable to physical extraction)
- Scattering `SKILL.md` files across multiple directories without a unified view
- Manually editing Markdown files to update agent capabilities
- Lacking a portable, encrypted backup of the entire agent configuration

## Why LUKS on USB 3.0
1. **Physical portability**: Unplug the drive and the entire agent configuration moves with you
2. **Hardware-grade encryption**: LUKS2 with AES-256-XTS provides full-disk encryption transparent to applications once unlocked
3. **Atomic lock/unlock**: Secure the entire vault by unmounting and closing the LUKS volume, leaving no decrypted traces on Pi's local storage

## Why Browser-Based Local Application
- Best balance of developer ergonomics and deployment simplicity
- Single-page application served from the Pi at `http://localhost:3443`
- No Electron or Tauri bundling required
- Minimal deployment footprint

## Target User
Developers who manage infrastructure, not end users. The interface should feel like a developer tool:
- Monospaced fonts for variable names, file paths, and code blocks
- Dark mode by default
- Keyboard shortcuts for common actions
- Copy-to-clipboard buttons on every secret value
- Search and filter across all env vars, skills, and services
