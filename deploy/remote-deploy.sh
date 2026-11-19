#!/usr/bin/env bash
# Runs on the VPS, called by the Deploy workflow after it uploads a release.
# Installs the server's production dependencies, switches /opt/pixelyard/current to the new release,
# restarts the service and waits for /health to report the new version. Rolls back if it does not.
# Usage: remote-deploy.sh <tag>
set -euo pipefail

TAG="${1:?usage: remote-deploy.sh <tag>}"
BASE=/opt/pixelyard
REL="$BASE/releases/$TAG"
PORT="$(sed -n 's/^PORT=//p' /etc/pixelyard.env 2>/dev/null | tail -1)"
PORT="${PORT:-2567}"
KEEP=5

cd "$REL"
npm ci --omit=dev -w @pixelyard/server --no-audit --no-fund --loglevel=error
echo "APP_VERSION=$TAG" > release.env

PREV="$(readlink -f "$BASE/current" 2>/dev/null || true)"
switch_to() {
  ln -sfn "$1" "$BASE/current.next"
  mv -Tf "$BASE/current.next" "$BASE/current"
  sudo /usr/bin/systemctl restart pixelyard
}

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q "\"version\":\"$1\""; then return 0; fi
    sleep 1
  done
  return 1
}

switch_to "$REL"
if healthy "$TAG"; then
  echo "Deployed $TAG"
else
  echo "::error::$TAG did not become healthy." >&2
  journalctl -u pixelyard -n 40 --no-pager 2>/dev/null || true
  if [ -n "$PREV" ] && [ -d "$PREV" ] && [ "$PREV" != "$REL" ]; then
    echo "Rolling back to $(basename "$PREV")" >&2
    switch_to "$PREV"
    if healthy "$(basename "$PREV")"; then echo "Rolled back to $(basename "$PREV")" >&2
    else echo "::error::Rollback to $(basename "$PREV") is not healthy either." >&2; fi
    rm -rf "$REL" # the failed release; its logs stay in the journal
  fi
  exit 1
fi

# Keep the newest releases for quick rollback; never delete the one in use.
CUR="$(readlink -f "$BASE/current")"
ls -1dt "$BASE"/releases/*/ | tail -n +$((KEEP + 1)) | while read -r dir; do
  [ "$(readlink -f "$dir")" = "$CUR" ] || rm -rf "$dir"
done
