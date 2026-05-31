#!/bin/bash
# Update a deployed Secure Vault v2 instance to the latest branch, the SAFE way:
#  - pull latest into the source git clone (as the owning user)
#  - sync ONLY code into the deployment (preserve .env, data/, node_modules, dist)
#  - npm install + build + migrate IN the deployment, under its own Node version
#    (avoids the better-sqlite3 NODE_MODULE_VERSION / ABI trap that re-running
#     bin/setup.sh would reintroduce — see "Updating a Deployed Instance" in README)
#  - back up the DB first, restart the service, and report status
#
# Run:  sudo bash bin/update-vault.sh
#
# Configurable via environment:
#   UPDATE_VAULT_USER  owner of the source clone     (default: $SUDO_USER)
#   VAULT_SRC          source git clone path         (default: /home/$USER_NAME/secure-vault)
#   VAULT_APP          deployment directory          (default: /opt/openclaw-vault)
#   VAULT_SERVICE      systemd unit name             (default: openclaw-vault)
#   VAULT_BRANCH       branch to track               (default: main)
#   VAULT_PORT         listen port to check          (default: 3001)
#   GITHUB_TOKEN       optional PAT for the fetch     (default: use origin's configured creds)
#   KEEP_BACKUPS       DB backups to retain           (default: 10)
set -euo pipefail
export PATH="/usr/bin:/usr/sbin:/bin:/sbin"

USER_NAME="${UPDATE_VAULT_USER:-${SUDO_USER:-$(id -un)}}"
SRC="${VAULT_SRC:-/home/$USER_NAME/secure-vault}"
APP="${VAULT_APP:-/opt/openclaw-vault}"
VU="${VAULT_SERVICE:-openclaw-vault}"
BRANCH="${VAULT_BRANCH:-main}"
PORT="${VAULT_PORT:-3001}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
TS="$(date +%Y%m%d-%H%M%S)"

[ -d "$SRC/.git" ]    || { echo "ABORT: $SRC is not a git clone." >&2; exit 1; }
[ -d "$APP/backend" ] || { echo "ABORT: $APP not deployed." >&2; exit 1; }

echo "==> [1/7] Stopping service ($VU)"
systemctl stop "$VU"

echo "==> [2/7] Backing up DB to $APP/backend/data/backups/"
BACKUP_DIR="$APP/backend/data/backups"
install -d -o "$VU" -g "$VU" "$BACKUP_DIR"
if [ -f "$APP/backend/data/vault.db" ]; then
  sudo -u "$VU" sqlite3 "$APP/backend/data/vault.db" ".backup '$BACKUP_DIR/vault-$TS.db'"
  echo "    backup: vault-$TS.db"
  # Prune: keep the $KEEP_BACKUPS most recent, delete older ones.
  mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/vault-*.db 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)))
  if [ "${#OLD[@]}" -gt 0 ]; then
    for f in "${OLD[@]}"; do rm -f "$f" && echo "    pruned $(basename "$f")"; done
  fi
  echo "    retained $(ls -1 "$BACKUP_DIR"/vault-*.db 2>/dev/null | wc -l) backup(s) (keep=$KEEP_BACKUPS)"
else
  echo "    no vault.db yet — skipping backup"
fi

echo "==> [3/7] Fetching latest $BRANCH into $SRC (as $USER_NAME)"
sudo -u "$USER_NAME" env GITHUB_TOKEN="${GITHUB_TOKEN:-}" SRC="$SRC" BRANCH="$BRANCH" \
  bash -s <<'EOSU' 2>&1 | sed -E 's#x-access-token:[A-Za-z0-9_]+@#x-access-token:<redacted>@#g'
set -euo pipefail
cd "$SRC"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  # Inject the token for this fetch only; strip any creds already in the URL first.
  REMOTE_URL="$(git remote get-url origin | sed -E 's#https://[^@]*@#https://#')"
  AUTH_URL="$(printf '%s' "$REMOTE_URL" | sed -E "s#https://#https://x-access-token:${GITHUB_TOKEN}@#")"
  git fetch --depth 1 "$AUTH_URL" "$BRANCH"
else
  # Rely on origin's configured credentials (credential helper, SSH, or cached PAT).
  git fetch --depth 1 origin "$BRANCH"
fi
git reset --hard FETCH_HEAD
git log --oneline -1
EOSU

echo "==> [4/7] Syncing code into $APP (preserving .env, data/, node_modules, dist)"
rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='backend/.env' \
  --exclude='backend/data' \
  --exclude='frontend/dist' \
  "$SRC"/ "$APP"/

echo "==> [5/7] Installing deps + building IN $APP under $(node -v)"
cd "$APP" && npm run install:all
npm run build
node -e "require('$APP/backend/node_modules/better-sqlite3'); console.log('better-sqlite3 OK under', process.version)"

echo "==> [6/7] Ownership + migrations"
chown -R "$VU:$VU" "$APP"
sudo -u "$VU" bash -c "cd '$APP/backend' && npm run db:migrate"

echo "==> [7/7] Restarting service ($VU)"
systemctl start "$VU"
sleep 3
systemctl --no-pager --full status "$VU" | head -n 12
echo "--- listening ---"; ss -ltnp 2>/dev/null | grep -E ":$PORT" || echo "(nothing on $PORT)"
echo "--- recent logs ---"; journalctl -u "$VU" --no-pager -n 20
echo "DONE: updated to $(sudo -u "$USER_NAME" git -C "$SRC" log --oneline -1)"
