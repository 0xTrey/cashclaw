#!/usr/bin/env bash
set -euo pipefail

WORKER_USER="${WORKER_USER:-worker}"
WORKER_HOME="/home/${WORKER_USER}"
APP_ROOT="${APP_ROOT:-${WORKER_HOME}/openclaw-crypto-worker}"
SECRETS_DIR="${SECRETS_DIR:-/etc/openclaw-crypto-worker/secrets}"
CONTAINER_UID="${CONTAINER_UID:-10001}"
CONTAINER_GID="${CONTAINER_GID:-10001}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root so secrets can be copied safely into the worker runtime." >&2
  exit 1
fi

cd "${APP_ROOT}"

install -d -m 0700 -o "${CONTAINER_UID}" -g "${CONTAINER_GID}" ops/vm/runtime-secrets ops/vm/runtime-state

install -m 0400 -o "${CONTAINER_UID}" -g "${CONTAINER_GID}" \
  "${SECRETS_DIR}/base_rpc_url.txt" ops/vm/runtime-secrets/base_rpc_url.txt
install -m 0400 -o "${CONTAINER_UID}" -g "${CONTAINER_GID}" \
  "${SECRETS_DIR}/crypto_worker_token.txt" ops/vm/runtime-secrets/crypto_worker_token.txt
install -m 0400 -o "${CONTAINER_UID}" -g "${CONTAINER_GID}" \
  "${SECRETS_DIR}/burner_wallet_address.txt" ops/vm/runtime-secrets/burner_wallet_address.txt

TAILSCALE_IP="$(tailscale ip -4 | head -n 1)"
if [[ -z "${TAILSCALE_IP}" ]]; then
  echo "No Tailscale IPv4 address found. Run 'sudo tailscale up' first." >&2
  exit 1
fi

su - "${WORKER_USER}" -c "
  cd '${APP_ROOT}' && \
  export OPENCLAW_CRYPTO_VM_TAILSCALE_IP='${TAILSCALE_IP}' && \
  docker compose -f ops/vm/docker-compose.vm-dry-run.yml up --build -d
"

echo "Dry-run worker deployed."
echo "Tailscale URL: http://${TAILSCALE_IP}:3777"
echo "Token file: ${SECRETS_DIR}/crypto_worker_token.txt"
echo "Health check:"
echo "TOKEN=\$(cat ${SECRETS_DIR}/crypto_worker_token.txt)"
echo "curl -H \"Authorization: Bearer \$TOKEN\" http://${TAILSCALE_IP}:3777/api/health"
