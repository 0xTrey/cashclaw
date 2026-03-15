# OpenClaw Crypto Worker

`openclaw-crypto-worker` is a deterministic Base trading sidecar designed to sit behind your main OpenClaw agent, not inside it.

The goal is narrow and deliberate:

- OpenClaw on your Mac can reason about whether to submit a small trade intent.
- The worker on a separate host can only quote and execute pinned `USDC <-> WETH` spot swaps on Base.
- The Mac never needs the burner wallet key, recovery phrase, or generic contract access.

## Why this fork exists

The original `cashclaw` repo was an autonomous marketplace agent. This fork removes the marketplace loop, in-process LLM autonomy, memory injection, AgentCash, wallet import UI, and Moltlaunch integration entirely.

What remains is:

- A deterministic HTTP worker
- Hard-coded policy limits enforced in code
- A read-only dashboard with `pause` and `resume`
- An append-only JSONL ledger for quotes, rejects, executions, and portfolio snapshots
- A local OpenClaw wrapper for bounded remote access

## Hard limits

V1 is intentionally small:

- Chain: Base mainnet only (`8453`)
- Pair: `USDC/WETH` only
- Per-trade max: `$5`
- 24h notional max: `$15`
- 24h trade count max: `3`
- Max WETH exposure: `50%`
- Slippage ceiling: `100 bps`
- Min gas reserve: `0.0005 ETH`
- Kill switch: stop after `$10` loss over rolling 24h
- Startup posture: `paused=true`
- Default execution mode: `dry-run`

The worker never exposes:

- Private keys
- Recovery phrases
- Raw signed transactions
- Arbitrary calldata
- Generic token transfers
- Generic contract calls

## Architecture

```text
OpenClaw (Mac) -> crypto_worker wrapper -> authenticated worker API -> Base RPC
                                     \
                                      -> read-only dashboard
```

Trust boundaries:

- OpenClaw only gets `CRYPTO_WORKER_URL` and `CRYPTO_WORKER_TOKEN`
- Wallet keys stay only on the separate worker host
- The worker accepts only structured requests, not free-form “tool choice” prompts
- Policy enforcement happens before any signing path

## API

Authenticated endpoints:

- `GET /api/health`
- `GET /api/policy`
- `GET /api/portfolio`
- `GET /api/history?limit=N`
- `POST /api/quote`
- `POST /api/trade-intents`
- `POST /api/pause`
- `POST /api/resume`

Quote and trade requests use:

```json
{
  "pair": "USDC/WETH",
  "side": "buy",
  "notionalUsd": 5
}
```

Trade intents add:

```json
{
  "thesis": "Tiny probe after policy check",
  "source": "openclaw",
  "sourceSessionId": "session-123"
}
```

All action responses use:

```json
{
  "accepted": true,
  "reason": "optional",
  "quote": {},
  "execution": {},
  "policySnapshot": {}
}
```

## Local development

```bash
npm install
npm run typecheck
npm test
npm run build:all
```

Bootstrap a local config from environment:

```bash
export BASE_RPC_URL="https://..."
export CRYPTO_WORKER_TOKEN="replace-me"
export BURNER_WALLET_ADDRESS="0x..."

# optional for live mode
export BURNER_PRIVATE_KEY="0x..."
export OPENCLAW_CRYPTO_WORKER_MODE="dry-run"
export OPENCLAW_CRYPTO_WORKER_HOST="127.0.0.1"
export OPENCLAW_CRYPTO_WORKER_PORT="3777"

npm run build:all
node dist/index.js
```

Docker secrets are also supported with:

- `BASE_RPC_URL_FILE`
- `CRYPTO_WORKER_TOKEN_FILE`
- `BURNER_PRIVATE_KEY_FILE`
- `BURNER_WALLET_ADDRESS_FILE`

The worker stores state in `~/.openclaw-crypto-worker/` by default:

- `config.json`
- `ledger.jsonl`

Override with `OPENCLAW_CRYPTO_WORKER_HOME`.

## Separate-host deployment

Example deployment files live in [`ops/Dockerfile`](/Users/treyharnden/Projects/cashclaw-security-review/ops/Dockerfile) and [`ops/docker-compose.example.yml`](/Users/treyharnden/Projects/cashclaw-security-review/ops/docker-compose.example.yml).

Recommended posture:

- Separate VM or mini PC
- No personal files, browser state, synced drives, or SSH agent forwarding
- Bind only to a Tailscale IP
- Restrict egress to Base RPC, Tailscale, DNS, NTP, and OS updates
- Keep root filesystem read-only
- Keep secrets in root-owned files or Docker secrets

## OpenClaw integration

Artifacts live in [`integration/openclaw/README.md`](/Users/treyharnden/Projects/cashclaw-security-review/integration/openclaw/README.md).

The wrapper contract is:

```bash
crypto_worker status
crypto_worker policy
crypto_worker portfolio
crypto_worker history --limit 20
crypto_worker quote --side buy --usd 5
crypto_worker trade --side buy --usd 5 --thesis "Tiny probe after policy check"
crypto_worker pause
crypto_worker resume
```

Install the agent workspace and wrapper allowlist:

```bash
./integration/openclaw/install-crypto-exec.sh
```

The installer does not place wallet keys on your Mac.

## Review harness

The existing Docker review harness remains in [`review/`](/Users/treyharnden/Projects/cashclaw-security-review/review).

Run it with:

```bash
./review/run-smoke-review.sh
```

It builds from an official Node image, installs with `npm ci --ignore-scripts`, and runs tests/typecheck/build inside a locked container.

## Rollout order

1. Dry-run only and confirm quotes, rejects, and pause/resume behavior.
2. Fund gas only and verify all hard rejects before live swaps.
3. Trade with `$5` for one week.
4. Raise to `$50` only after a clean ledger and no secret-handling regressions.
