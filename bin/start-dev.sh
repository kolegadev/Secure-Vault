#!/usr/bin/env bash
set -euo pipefail

# OpenClaw Secure Vault — Development Start Script
# Usage: ./bin/start-dev.sh
#
# This script starts both the backend (with nodemon) and the frontend Vite dev server.
# Press Ctrl+C to stop both.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "🔐 OpenClaw Secure Vault — Development Mode"

# Check Node.js version
NODE_VERSION=$(node --version | sed 's/v//')
REQUIRED_MAJOR=18
ACTUAL_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$ACTUAL_MAJOR" -lt "$REQUIRED_MAJOR" ]; then
  echo "❌ Error: Node.js >= ${REQUIRED_MAJOR}.0.0 required (found ${NODE_VERSION})"
  exit 1
fi

# Install dependencies if missing
if [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm run install:all
fi

# Run database migrations
echo "🗄️  Running database migrations..."
cd backend && npm run db:migrate && cd ..

echo ""
echo "🚀 Starting development servers..."
echo "   Backend API: http://localhost:3001"
echo "   Frontend UI: http://localhost:5173"
echo ""
echo "   Press Ctrl+C to stop both servers."
echo ""

npm run dev
