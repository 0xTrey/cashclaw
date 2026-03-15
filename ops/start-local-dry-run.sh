#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
ROOT_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
SECRETS_DIR="${SCRIPT_DIR}/local-secrets"
STATE_DIR="${SCRIPT_DIR}/local-state"
WRAPPER_ENV="${ROOT_DIR}/integration/openclaw/crypto-worker.env"

mkdir -p "${SECRETS_DIR}" "${STATE_DIR}"

if [[ ! -f "${SECRETS_DIR}/base_rpc_url.txt" ]]; then
  printf '%s\n' "${BASE_RPC_URL:-https://mainnet.base.org}" > "${SECRETS_DIR}/base_rpc_url.txt"
fi

if [[ ! -f "${SECRETS_DIR}/crypto_worker_token.txt" ]]; then
  openssl rand -hex 24 > "${SECRETS_DIR}/crypto_worker_token.txt"
fi

if [[ ! -f "${SECRETS_DIR}/burner_wallet_address.txt" ]]; then
  printf '%s\n' "${BURNER_WALLET_ADDRESS:-0x1111111111111111111111111111111111111111}" > "${SECRETS_DIR}/burner_wallet_address.txt"
fi

chmod 0700 "${SECRETS_DIR}" "${STATE_DIR}"
chmod 0600 "${SECRETS_DIR}"/*.txt

TOKEN="$(tr -d '\n' < "${SECRETS_DIR}/crypto_worker_token.txt")"
URL="http://127.0.0.1:3777"

cat > "${WRAPPER_ENV}" <<EOF
CRYPTO_WORKER_URL=${URL}
CRYPTO_WORKER_TOKEN=${TOKEN}
EOF
chmod 0600 "${WRAPPER_ENV}"

docker compose -f "${SCRIPT_DIR}/docker-compose.local.yml" up --build -d

printf 'Local dry-run worker is starting.\n'
printf 'URL: %s\n' "${URL}"
printf 'Wrapper env: %s\n' "${WRAPPER_ENV}"
