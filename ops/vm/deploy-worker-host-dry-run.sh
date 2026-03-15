#!/usr/bin/env bash
set -euo pipefail

WORKER_USER="${WORKER_USER:-worker}"
WORKER_HOME="/home/${WORKER_USER}"
APP_ROOT="${APP_ROOT:-${WORKER_HOME}/openclaw-crypto-worker}"
SECRETS_DIR="${SECRETS_DIR:-/etc/openclaw-crypto-worker/secrets}"

cd "${APP_ROOT}"

mkdir -p ops/vm/runtime-secrets ops/vm/runtime-state

cp "${SECRETS_DIR}/base_rpc_url.txt" ops/vm/runtime-secrets/base_rpc_url.txt
cp "${SECRETS_DIR}/crypto_worker_token.txt" ops/vm/runtime-secrets/crypto_worker_token.txt
cp "${SECRETS_DIR}/burner_wallet_address.txt" ops/vm/runtime-secrets/burner_wallet_address.txt

chmod 0700 ops/vm/runtime-secrets ops/vm/runtime-state
chmod 0600 ops/vm/runtime-secrets/*.txt

TAILSCALE_IP="$(tailscale ip -4 | head -n 1)"
if [[ -z "${TAILSCALE_IP}" ]]; then
  echo "No Tailscale IPv4 address found. Run 'sudo tailscale up' first." >&2
  exit 1
fi

export OPENCLAW_CRYPTO_VM_TAILSCALE_IP="${TAILSCALE_IP}"

docker compose -f ops/vm/docker-compose.vm-dry-run.yml up --build -d

TOKEN="$(tr -d '\n' < ops/vm/runtime-secrets/crypto_worker_token.txt)"
echo "Dry-run worker deployed."
echo "Tailscale URL: http://${TAILSCALE_IP}:3777"
echo "Token file: ${SECRETS_DIR}/crypto_worker_token.txt"
echo "Health check:"
echo "curl -H 'Authorization: Bearer ${TOKEN}' http://${TAILSCALE_IP}:3777/api/health"
