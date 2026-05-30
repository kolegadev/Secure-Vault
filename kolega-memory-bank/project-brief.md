# OpenClaw Secure Vault — Project Brief

## Overview
OpenClaw Secure Vault is a local browser-based utility application that manages sensitive environment variables, API service documentation, and Agent SKILL.md files stored on a VeraCrypt-encrypted USB drive. It runs locally on Linux, macOS, and Windows, and optionally on a Raspberry Pi 5 as a Tailscale-only Secret Server.

## Target Platforms
- **Local Mode**: Linux, macOS, Windows
- **Server Mode**: Raspberry Pi 5 (BCM2712 SoC, 4–8 GB RAM) with Raspberry Pi OS (64-bit, Bookworm)
- **Storage**: VeraCrypt-encrypted USB 3.0 flash drive or SSD (exFAT inner filesystem)
- **Network Access (Local Mode)**: Local web interface at `http://localhost:3001`
- **Network Access (Server Mode)**: Tailscale IP only (`100.x.x.x:8787`)

## Core Goals
1. **Security**: All secrets stored on VeraCrypt-encrypted USB; host disk holds no sensitive data
2. **Portability**: Unplug the drive and the entire agent configuration moves with you
3. **Cross-Platform**: Works on Linux, macOS, and Windows without OS-specific encryption tools
4. **Developer Experience**: Modern dashboard with tables, forms, Markdown editors, dropdown selectors
5. **OpenClaw Integration**: Deep integration with OpenClaw agentic AI ecosystem (skills, .env files)
6. **Zero Cloud Dependency**: Total data sovereignty

## Key Features
- VeraCrypt Volume Creation & Management (headless CLI)
- Environment Variable Dashboard (CRUD, redaction, metadata)
- Sub-README.md Auto-Generation
- SKILL.md Dropdown Selection & Linking
- SKILL.md Registry (Library Management)
- Pi5 Secret Server with profile-based ACLs
- Signing Agent for Tier 1 cryptographic operations
- Developer-Friendly UI (dark mode, keyboard shortcuts, monospaced fonts)

## Technology Stack
- **Runtime**: Node.js 20.x LTS
- **Backend**: Express.js 4.x
- **Secret Server**: Python 3.12 + FastAPI + Uvicorn
- **Database**: SQLite3 (via better-sqlite3) on encrypted volume
- **Frontend**: React 18+ SPA with Vite
- **UI**: shadcn/ui + Tailwind CSS
- **State**: React Context + SWR
- **Real-time**: WebSocket (ws library)
- **Process Manager**: systemd
- **Encryption**: VeraCrypt (AES / SHA-512) with exFAT inner filesystem
- **Network**: Tailscale (WireGuard) for Secret Server

## Data Storage Strategy
- **SQLite**: Metadata index (env var names, descriptions, skill registry, session data) on VeraCrypt volume
- **VeraCrypt Volume**: .env files, SKILL.md files, README.md files, exported archives, signing keys, audit logs
- **OpenClaw Paths**: Symbolic links or copies of SKILL.md into `~/.openclaw/skills/`
