#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root on the Ubuntu worker host." >&2
  exit 1
fi

WORKER_USER="${WORKER_USER:-worker}"
WORKER_HOME="/home/${WORKER_USER}"
APP_ROOT="${APP_ROOT:-${WORKER_HOME}/openclaw-crypto-worker}"
STATE_DIR="${STATE_DIR:-/var/lib/openclaw-crypto-worker}"
SECRETS_DIR="${SECRETS_DIR:-/etc/openclaw-crypto-worker/secrets}"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl git jq ufw unattended-upgrades

# Docker Engine install follows Docker's official Ubuntu apt-repository instructions.
apt-get remove -y docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc || true
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# Tailscale install follows Tailscale's current Linux install guidance.
curl -fsSL https://tailscale.com/install.sh | sh
systemctl enable --now tailscaled

# Keep the host closed by default and rely on Tailscale for worker access.
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow in on tailscale0 comment 'Tailscale'
ufw --force enable
dpkg-reconfigure -f noninteractive unattended-upgrades

if ! id "${WORKER_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${WORKER_USER}"
fi

usermod -aG docker "${WORKER_USER}"
install -d -m 0755 -o "${WORKER_USER}" -g "${WORKER_USER}" "${APP_ROOT}"
install -d -m 0700 -o "${WORKER_USER}" -g "${WORKER_USER}" "${STATE_DIR}"
install -d -m 0700 "${SECRETS_DIR}"

cat <<EOF
Bootstrap complete.

Next steps:
  1. Log in to Tailscale:
     sudo tailscale up
  2. Copy this repo to:
     ${APP_ROOT}
  3. Create secrets:
     ${SECRETS_DIR}/base_rpc_url.txt
     ${SECRETS_DIR}/crypto_worker_token.txt
     ${SECRETS_DIR}/burner_private_key.txt
  4. Run:
     sudo -u ${WORKER_USER} ${APP_ROOT}/ops/vm/deploy-worker-host.sh

Notes:
  - Docker Engine install source: https://docs.docker.com/engine/install/ubuntu/
  - Tailscale install source: https://tailscale.com/docs/install/linux
  - UFW defaults to deny incoming, allows SSH, and trusts only the Tailscale interface
EOF
