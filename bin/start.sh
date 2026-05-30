#!/usr/bin/env bash
set -euo pipefail

# OpenClaw Secure Vault — Production Start Script
# Usage: ./bin/start.sh
#
# This script:
# 1. Ensures dependencies are installed
# 2. Builds the frontend if the dist/ folder is missing or stale
# 3. Runs database migrations
# 4. Starts the backend server (which serves the built frontend)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_FILE="${PROJECT_ROOT}/.openclaw-vault.pid"

cd "$PROJECT_ROOT"

echo "🔐 OpenClaw Secure Vault — Starting..."

# Check Node.js version
NODE_VERSION=$(node --version | sed 's/v//')
REQUIRED_MAJOR=18
ACTUAL_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$ACTUAL_MAJOR" -lt "$REQUIRED_MAJOR" ]; then
  echo "❌ Error: Node.js >= ${REQUIRED_MAJOR}.0.0 required (found ${NODE_VERSION})"
  exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm run install:all
fi

# Build frontend if dist is missing
if [ ! -d "frontend/dist" ] || [ "frontend/dist/index.html" -ot "frontend/src/main.jsx" ]; then
  echo "🔨 Building frontend..."
  npm run build:frontend
fi

# Run database migrations
echo "🗄️  Running database migrations..."
cd backend && npm run db:migrate && cd ..

# Start backend (serves frontend static files in production)
echo "🚀 Starting server..."
cd backend

# Use nohup so the server keeps running after the terminal closes
nohup node server.js > "${PROJECT_ROOT}/openclaw-vault.log" 2>&1 &
echo $! > "$PID_FILE"

sleep 1
if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "✅ Server started (PID: $(cat "$PID_FILE"))"
  echo "   Logs: ${PROJECT_ROOT}/openclaw-vault.log"
  echo "   API:  http://localhost:3001"
  echo "   UI:   http://localhost:3001"
else
  echo "❌ Server failed to start. Check logs: ${PROJECT_ROOT}/openclaw-vault.log"
  rm -f "$PID_FILE"
  exit 1
fi
