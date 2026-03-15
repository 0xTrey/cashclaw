# Review Harness

This folder contains a standalone Docker-based smoke test for the worker fork.

## What it does

- Builds from an official Node image instead of trusting repo-supplied container logic.
- Installs dependencies with `npm ci --ignore-scripts`.
- Runs `npm test`, `npm run typecheck`, and `npm run build` inside a locked container.
- Uses a read-only root filesystem with `tmpfs` mounts and no host home-directory mounts.
- Runs with `--network none` at runtime so the app cannot touch live wallets, Moltlaunch, or LLM endpoints during the smoke test.

## Usage

```sh
./review/run-smoke-review.sh
```

The script does not mount your host home directory, Docker socket, SSH keys, or wallet/config directories.
