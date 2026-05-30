#!/usr/bin/env bash
set -euo pipefail

# OpenClaw Secure Vault — Stop Script
# Usage: ./bin/stop.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_FILE="${PROJECT_ROOT}/.openclaw-vault.pid"

cd "$PROJECT_ROOT"

if [ ! -f "$PID_FILE" ]; then
  echo "⚠️  No PID file found at $PID_FILE"
  echo "   Searching for running server process..."
  PIDS=$(pgrep -f "node server.js" || true)
  if [ -n "$PIDS" ]; then
    echo "   Found PID(s): $PIDS"
    echo "   Stopping..."
    echo "$PIDS" | xargs kill 2>/dev/null || true
    sleep 1
    echo "✅ Server stopped"
  else
    echo "   No running server found."
  fi
  exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
  echo "🛑 Stopping server (PID: $PID)..."
  kill "$PID"
  sleep 1
  if kill -0 "$PID" 2>/dev/null; then
    echo "   Force killing..."
    kill -9 "$PID" 2>/dev/null || true
  fi
  echo "✅ Server stopped"
else
  echo "⚠️  PID $PID is not running"
fi

rm -f "$PID_FILE"
