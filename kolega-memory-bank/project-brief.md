# OpenClaw Secure Vault — Project Brief

## Overview
OpenClaw Secure Vault is a local browser-based utility application that runs on a Raspberry Pi 5 and manages sensitive environment variables, API service documentation, and Agent SKILL.md files stored on a LUKS-encrypted USB 3.0 drive.

## Target Platform
- **Hardware**: Raspberry Pi 5 (BCM2712 SoC, 4–8 GB RAM)
- **OS**: Raspberry Pi OS (64-bit, Bookworm)
- **Storage**: LUKS-encrypted USB 3.0 flash drive or SSD
- **Access**: Local web interface at `https://localhost:3443`

## Core Goals
1. **Security**: All secrets stored on LUKS2-encrypted USB; Pi SD card holds no sensitive data
2. **Portability**: Unplug the drive and the entire agent configuration moves with you
3. **Developer Experience**: Modern dashboard with tables, forms, Markdown editors, dropdown selectors
4. **OpenClaw Integration**: Deep integration with OpenClaw agentic AI ecosystem (skills, .env files)
5. **Zero Cloud Dependency**: Total data sovereignty

## Key Features
- LUKS Volume Creation & Management
- Environment Variable Dashboard (CRUD, redaction, metadata)
- Sub-README.md Auto-Generation
- SKILL.md Dropdown Selection & Linking
- SKILL.md Registry (Library Management)
- Developer-Friendly UI (dark mode, keyboard shortcuts, monospaced fonts)

## Technology Stack
- **Runtime**: Node.js 20.x LTS
- **Backend**: Express.js 4.x
- **Database**: SQLite3 (via better-sqlite3) on encrypted volume
- **Frontend**: React 18+ SPA with Vite
- **UI**: shadcn/ui + Tailwind CSS
- **State**: React Context + SWR
- **Real-time**: WebSocket (ws library)
- **Process Manager**: PM2 / systemd
- **Encryption**: LUKS2 (cryptsetup) with AES-256-XTS
- **Filesystem**: ext4

## Data Storage Strategy
- **SQLite**: Metadata index (env var names, descriptions, skill registry, session data) on LUKS volume
- **LUKS Volume**: .env files, SKILL.md files, README.md files, exported archives
- **OpenClaw Paths**: Symbolic links or copies of SKILL.md into `~/.openclaw/skills/`
