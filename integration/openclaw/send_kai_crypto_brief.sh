#!/usr/bin/env bash
set -euo pipefail

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
BRIEF_SCRIPT="${SCRIPT_DIR}/crypto_worker_daily_brief"
OPENCLAW_BIN="${OPENCLAW_BIN:-/opt/homebrew/bin/openclaw}"
DISCORD_TARGET="${OPENCLAW_KAI_DISCORD_TARGET:-#kai-ee-ceo}"
DISCORD_CHANNEL="${OPENCLAW_KAI_DISCORD_CHANNEL:-discord}"
MAX_CHARS="${OPENCLAW_KAI_DISCORD_MAX_CHARS:-1800}"

if [[ ! -x "${OPENCLAW_BIN}" ]]; then
  echo "OpenClaw binary not found at ${OPENCLAW_BIN}" >&2
  exit 1
fi

if [[ ! -x "${BRIEF_SCRIPT}" ]]; then
  echo "Brief script not found or not executable: ${BRIEF_SCRIPT}" >&2
  exit 1
fi

brief="$("${BRIEF_SCRIPT}")"

if [[ -z "${brief}" ]]; then
  echo "Brief script returned empty output." >&2
  exit 1
fi

chunks_json="$(
  BRIEF_TEXT="${brief}" MAX_CHARS="${MAX_CHARS}" python3 - <<'PY'
import json
import os

text = os.environ["BRIEF_TEXT"].strip()
limit = int(os.environ["MAX_CHARS"])

def split_long_block(block: str, size: int) -> list[str]:
    if len(block) <= size:
        return [block]
    pieces: list[str] = []
    current = ""
    for line in block.splitlines():
        candidate = line if not current else f"{current}\n{line}"
        if len(candidate) <= size:
            current = candidate
            continue
        if current:
            pieces.append(current)
            current = ""
        while len(line) > size:
            pieces.append(line[:size])
            line = line[size:]
        current = line
    if current:
        pieces.append(current)
    return pieces

blocks: list[str] = []
for paragraph in text.split("\n\n"):
    paragraph = paragraph.strip()
    if not paragraph:
        continue
    blocks.extend(split_long_block(paragraph, limit))

chunks: list[str] = []
current = ""
for block in blocks:
    candidate = block if not current else f"{current}\n\n{block}"
    if len(candidate) <= limit:
        current = candidate
        continue
    if current:
        chunks.append(current)
    current = block
if current:
    chunks.append(current)

print(json.dumps(chunks))
PY
)"

while IFS= read -r chunk; do
  [[ -z "${chunk}" ]] && continue
  "${OPENCLAW_BIN}" message send \
    --channel "${DISCORD_CHANNEL}" \
    --target "${DISCORD_TARGET}" \
    --message "${chunk}" \
    --silent >/dev/null
done < <(printf '%s' "${chunks_json}" | jq -r '.[]')

