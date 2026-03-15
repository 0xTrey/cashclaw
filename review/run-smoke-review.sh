#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
IMAGE_TAG="openclaw-crypto-worker-review:local"

printf '[review] building %s\n' "$IMAGE_TAG"
docker build -f "$ROOT_DIR/review/Dockerfile" -t "$IMAGE_TAG" "$ROOT_DIR"

printf '[review] running smoke review in locked container\n'
docker run --rm \
  --read-only \
  --network none \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 256 \
  --memory 2g \
  --cpus 2 \
  --tmpfs /tmp:rw,noexec,nosuid,size=512m \
  --tmpfs /home/reviewer:rw,noexec,nosuid,size=512m \
  --tmpfs /workspace:rw,exec,nosuid,size=2048m \
  "$IMAGE_TAG"
