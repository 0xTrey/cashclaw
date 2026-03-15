#!/bin/sh
set -eu

SRC_DIR=/opt/cashclaw-src
WORK_DIR=/workspace

mkdir -p "$WORK_DIR"
cp -R "$SRC_DIR"/. "$WORK_DIR"/
chmod -R u+rwX "$WORK_DIR"/node_modules

cd "$WORK_DIR"

printf '\n[review] npm test\n'
npm test

printf '\n[review] npm run typecheck\n'
npm run typecheck

printf '\n[review] npm run build\n'
npm run build
