#!/usr/bin/env bash
# One-time setup of a Debian/Ubuntu VPS for Pixelyard. Run as root:
#   sudo bash setup-vm.sh "<public SSH key used by GitHub Actions>" [<Cloudflare Tunnel token>]
# Safe to run again: it updates what is already there.
#
# It creates:
#   - user `pixelyard`, which GitHub Actions logs in as and which runs the server
#   - /opt/pixelyard/releases (one folder per release) and /opt/pixelyard/current (symlink to the live one)
#   - /etc/pixelyard.env for server settings (PORT, CLIENT_ORIGIN); kept if it already exists
#   - systemd service `pixelyard`, started by the first deploy
#   - optionally cloudflared, running the tunnel whose token you pass
set -euo pipefail

PUBKEY="${1:?usage: sudo bash setup-vm.sh \"<ssh public key>\" [tunnel token]}"
TUNNEL_TOKEN="${2:-}"
APP_USER=pixelyard
BASE=/opt/pixelyard

apt-get update -q
apt-get install -y -q curl rsync sudo ca-certificates gnupg

# Node.js 22
if ! command -v node >/dev/null || ! node -v | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi

# App user: logs in over SSH with the deploy key only, and may read the service logs.
id "$APP_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$APP_USER"
usermod -aG systemd-journal "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "/home/$APP_USER/.ssh"
printf '%s\n' "$PUBKEY" > "/home/$APP_USER/.ssh/authorized_keys"
chown "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh/authorized_keys"
chmod 600 "/home/$APP_USER/.ssh/authorized_keys"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$BASE" "$BASE/releases"

# The only root action deploys need.
echo "$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart pixelyard" > /etc/sudoers.d/pixelyard
chmod 440 /etc/sudoers.d/pixelyard
visudo -cf /etc/sudoers.d/pixelyard

# Server settings. Edit, then: sudo systemctl restart pixelyard
if [ ! -f /etc/pixelyard.env ]; then
  cat > /etc/pixelyard.env <<'CONF'
PORT=2567
# Only this website may use the matchmaker (comma-separated). Unset allows any origin.
# CLIENT_ORIGIN=https://play.example.com
CONF
fi
chown root:"$APP_USER" /etc/pixelyard.env
chmod 640 /etc/pixelyard.env

cat > /etc/systemd/system/pixelyard.service <<'UNIT'
[Unit]
Description=Pixelyard game server
After=network-online.target
Wants=network-online.target

[Service]
User=pixelyard
WorkingDirectory=/opt/pixelyard/current
Environment=NODE_ENV=production
EnvironmentFile=-/etc/pixelyard.env
EnvironmentFile=-/opt/pixelyard/current/release.env
ExecStart=/usr/bin/node node_modules/tsx/dist/cli.mjs server/src/index.ts
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable pixelyard

# Cloudflare Tunnel: publishes the server without opening ports on the VPS.
if [ -n "$TUNNEL_TOKEN" ]; then
  if ! command -v cloudflared >/dev/null; then
    install -d -m 755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
      > /etc/apt/sources.list.d/cloudflared.list
    apt-get update -q
    apt-get install -y -q cloudflared
  fi
  systemctl is-enabled cloudflared >/dev/null 2>&1 || cloudflared service install "$TUNNEL_TOKEN"
fi

echo "VPS ready. The first release deploy starts the pixelyard service."
