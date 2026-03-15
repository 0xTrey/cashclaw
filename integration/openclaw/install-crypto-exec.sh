#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
WRAPPER_PATH="${SCRIPT_DIR}/crypto_worker"
AGENT_ID="${OPENCLAW_CRYPTO_EXEC_AGENT_ID:-crypto-exec}"
WORKSPACE="${OPENCLAW_CRYPTO_EXEC_WORKSPACE:-$HOME/.openclaw/workspaces/${AGENT_ID}}"
MODEL="${OPENCLAW_CRYPTO_EXEC_MODEL:-$(openclaw config get agents.defaults.model.primary 2>/dev/null || echo moonshot/kimi-k2.5)}"

mkdir -p "$WORKSPACE"
chmod 0755 "$WRAPPER_PATH"

if ! openclaw agents list --json | node -e 'const fs = require("node:fs"); const agentId = process.argv[1]; const agents = JSON.parse(fs.readFileSync(0, "utf8")); process.exit(agents.some((agent) => agent.id === agentId) ? 0 : 1);' "$AGENT_ID"; then
  openclaw agents add "$AGENT_ID" --workspace "$WORKSPACE" --model "$MODEL" --non-interactive --json
fi

if ! openclaw approvals get --json | node -e 'const fs = require("node:fs"); const wrapper = process.argv[1]; const agentId = process.argv[2]; const data = JSON.parse(fs.readFileSync(0, "utf8")); const allowlist = data.file?.agents?.[agentId]?.allowlist ?? []; process.exit(allowlist.some((entry) => entry.pattern === wrapper) ? 0 : 1);' "$WRAPPER_PATH" "$AGENT_ID"; then
  openclaw approvals allowlist add --agent "$AGENT_ID" "$WRAPPER_PATH"
fi

cat <<EOF
Installed the local wrapper and created the ${AGENT_ID} agent workspace.

Review these next steps before letting OpenClaw use the worker:
  1. Add only CRYPTO_WORKER_URL and CRYPTO_WORKER_TOKEN to OpenClaw secrets on your Mac.
  2. Turn Docker sandbox on for ${AGENT_ID} and keep its workspace scoped to:
     ${WORKSPACE}
  3. Verify the effective policy:
     openclaw sandbox explain --agent ${AGENT_ID}
     openclaw approvals get --json
  4. Optional hourly bounded autonomy:
     openclaw cron add --agent ${AGENT_ID} --session isolated --every 1h --light-context --thinking minimal --timeout-seconds 180 --no-deliver --name crypto-sidecar-hourly --message "Run ${WRAPPER_PATH} status, then policy, then portfolio. If mode is not live, stop. If gas is below reserve, any hard cap is reached, or balances do not safely support a \$5 trade, stop. You may resume the worker, submit at most one \$5 trade with ${WRAPPER_PATH} trade using a thesis under 120 characters, then immediately pause the worker again. If any step fails, pause the worker and stop. Never run anything outside ${WRAPPER_PATH}."

Read:
  ${SCRIPT_DIR}/README.md
EOF
