# OpenClaw Integration

This folder contains the narrow Mac-side integration for the remote crypto worker.

## What lives on the Mac

- `CRYPTO_WORKER_URL`
- `CRYPTO_WORKER_TOKEN`
- The `crypto_worker` wrapper
- A dedicated `crypto-exec` OpenClaw agent with its own small workspace

## What must never live on the Mac

- Burner private key
- Burner recovery phrase
- Base RPC provider secret if you can avoid it
- Any wallet export path from the worker host

## Install the wrapper and agent workspace

```bash
./integration/openclaw/install-crypto-exec.sh
```

The installer creates the `crypto-exec` agent if missing, creates a dedicated workspace, and allowlists only the wrapper path for exec approvals.

## Wrapper contract

```bash
crypto_worker status
crypto_worker policy
crypto_worker portfolio
crypto_worker history --limit 20
crypto_worker quote --side buy --usd 5
crypto_worker trade --side buy --usd 5 --thesis "Tiny probe after policy check"
crypto_worker_daily_brief
crypto_worker pause
crypto_worker resume
```

All calls go through the worker's authenticated HTTP API. The wrapper never touches wallet keys.

## Recommended OpenClaw posture

- Agent id: `crypto-exec`
- Workspace: a new small directory, not your default OpenClaw workspace
- Sandbox: Docker on
- Allowlist: only the absolute path to `integration/openclaw/crypto_worker`
- Model behavior: bounded autonomy only, one trade intent per run max

## Suggested hourly automation prompt

Use this message payload for an hourly job after you have manually reviewed the agent:

```text
Run /Users/treyharnden/Projects/cashclaw-security-review/integration/openclaw/crypto_worker status, then policy, then portfolio.
If mode is not live, gas is below reserve, any hard cap is already reached, or balances do not safely support a $5 trade, stop.
You may resume the worker, submit at most one $5 trade with /Users/treyharnden/Projects/cashclaw-security-review/integration/openclaw/crypto_worker trade, then immediately pause the worker again.
Keep the thesis under 120 characters and never attempt any action outside the wrapper commands.
If any step fails, pause the worker and stop.
```

## Daily brief wrapper

Use the read-only daily brief wrapper when you want a 24-hour operator summary without granting an agent broad shell access:

```bash
/Users/treyharnden/Projects/cashclaw-security-review/integration/openclaw/crypto_worker_daily_brief
```

It summarizes:

- current mode, pause state, and balances
- trades, failures, and rejects from the last 24 hours
- hourly cron health and next run time
- the daily brief cron status itself
