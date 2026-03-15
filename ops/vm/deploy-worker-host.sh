#!/usr/bin/env bash
set -euo pipefail

WORKER_USER="${WORKER_USER:-worker}"
WORKER_HOME="/home/${WORKER_USER}"
APP_ROOT="${APP_ROOT:-${WORKER_HOME}/openclaw-crypto-worker}"
STATE_DIR="${STATE_DIR:-/var/lib/openclaw-crypto-worker}"
SECRETS_DIR="${SECRETS_DIR:-/etc/openclaw-crypto-worker/secrets}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root so secrets can be copied safely into the worker runtime." >&2
  exit 1
fi

cd "${APP_ROOT}"

install -d -m 0700 -o "${WORKER_USER}" -g "${WORKER_USER}" ops/vm/runtime-secrets ops/vm/runtime-state

install -m 0600 -o "${WORKER_USER}" -g "${WORKER_USER}" \
  "${SECRETS_DIR}/base_rpc_url.txt" ops/vm/runtime-secrets/base_rpc_url.txt
install -m 0600 -o "${WORKER_USER}" -g "${WORKER_USER}" \
  "${SECRETS_DIR}/crypto_worker_token.txt" ops/vm/runtime-secrets/crypto_worker_token.txt
install -m 0600 -o "${WORKER_USER}" -g "${WORKER_USER}" \
  "${SECRETS_DIR}/burner_private_key.txt" ops/vm/runtime-secrets/burner_private_key.txt

TAILSCALE_IP="$(tailscale ip -4 | head -n 1)"
if [[ -z "${TAILSCALE_IP}" ]]; then
  echo "No Tailscale IPv4 address found. Run 'sudo tailscale up' first." >&2
  exit 1
fi

su - "${WORKER_USER}" -c "
  cd '${APP_ROOT}' && \
  export OPENCLAW_CRYPTO_VM_TAILSCALE_IP='${TAILSCALE_IP}' && \
  docker compose -f ops/vm/docker-compose.vm.yml up --build -d
"

echo "Worker deployed."
echo "Tailscale URL: http://${TAILSCALE_IP}:3777"
echo "Token file: ${SECRETS_DIR}/crypto_worker_token.txt"
echo "Health check:"
echo "TOKEN=\$(cat ${SECRETS_DIR}/crypto_worker_token.txt)"
echo "curl -H \"Authorization: Bearer \$TOKEN\" http://${TAILSCALE_IP}:3777/api/health"
