# Tech Context

## Technology Stack
| Layer | Technology | Version |
|-------|------------|---------|
| OS | Raspberry Pi OS (Bookworm, 64-bit) | Latest |
| Runtime | Node.js | 20.x LTS |
| Backend Framework | Express.js | 4.x |
| Database | SQLite3 (via better-sqlite3) | Latest |
| Frontend Framework | React | 18.x |
| Build Tool | Vite | 5.x |
| UI Components | shadcn/ui + Tailwind CSS | Latest |
| State Management | React Context + SWR | Latest |
| Real-time | WebSocket (ws library) | 8.x |
| Process Manager | PM2 | 5.x |
| Service Manager | systemd | Built-in |
| Encryption | LUKS2 (cryptsetup) | 2.x |
| Filesystem | ext4 | Built-in |

## Key npm Dependencies
```json
{
  "dependencies": {
    "express": "^4.18.0",
    "better-sqlite3": "^9.0.0",
    "ws": "^8.14.0",
    "express-rate-limit": "^7.0.0",
    "helmet": "^7.0.0",
    "js-yaml": "^4.1.0",
    "marked": "^9.0.0",
    "multer": "^1.4.0",
    "bcryptjs": "^2.4.0",
    "jsonwebtoken": "^9.0.0",
    "cors": "^2.8.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^3.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

## Development Commands
- `npm install` — Install dependencies
- `npm run build` — Build frontend for production
- `npm start` — Start production server
- `npm run dev` — Start development server (Vite + nodemon)
- `npm test` — Run Jest + Supertest backend tests
- `npm run test:ui` — Run Vitest + React Testing Library frontend tests

## File Structure
```
/opt/openclaw-vault/
├── backend/
│   ├── server.js
│   ├── routes/ (auth, luks, env, skills, services, files, export)
│   ├── middleware/ (auth, error, rateLimit)
│   ├── services/ (luksManager, usbMonitor, fileManager, readmeGenerator, skillScanner)
│   ├── db/ (schema.sql, connection.js)
│   └── config/ (default.json)
├── frontend/
│   ├── src/
│   │   ├── main.jsx, App.jsx
│   │   ├── components/ (LoginView, Dashboard, EnvVarTable, SkillRegistry, etc.)
│   │   ├── hooks/ (useVaultStatus, useApi)
│   │   └── styles/ (index.css)
│   ├── index.html
│   └── vite.config.js
├── bin/ (setup.sh, usb-inserted.sh, backup.sh)
├── systemd/ (openclaw-vault.service)
└── package.json
```

## LUKS Volume Structure (mounted at /mnt/openclaw-vault)
```
/mnt/openclaw-vault/
├── vault.db              # SQLite metadata database
├── env/                  # Generated .env files
├── skills/               # SKILL.md library
├── services/             # Service documentation
├── exports/              # Export bundles
└── config/               # Vault-specific settings
```

## Testing Strategy
| Layer | Method | Coverage |
|-------|--------|----------|
| LUKS operations | Shell scripts + cryptsetup --test-passphrase | Volume lifecycle |
| API endpoints | Jest + Supertest | All CRUD, error cases, auth |
| Frontend components | Vitest + React Testing Library | Form validation, state transitions |
| Integration | Playwright | Full user journeys |
| Security | Manual penetration testing | Rate limits, CSRF, session hijacking |
