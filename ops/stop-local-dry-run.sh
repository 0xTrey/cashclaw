#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
docker compose -f "${SCRIPT_DIR}/docker-compose.local.yml" down
