# Ubuntu Worker Host

This folder is the deployment kit for moving the worker off your Mac and onto a real isolated Ubuntu host.

## What this gives you

- Docker Engine installed from Docker's official Ubuntu apt repository
- Tailscale installed using Tailscale's current Linux installer
- A dedicated Linux user for the worker
- A Docker Compose deployment that binds the worker only to the host's Tailscale IPv4

Official sources used:

- Docker Ubuntu install docs: [docs.docker.com/engine/install/ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- Tailscale Linux install docs: [tailscale.com/docs/install/linux](https://tailscale.com/docs/install/linux)

## Files

- `bootstrap-ubuntu-worker.sh`
  - Run once as `root` on a fresh Ubuntu 24.04 or 22.04 host
- `deploy-worker-host.sh`
  - Run as the `worker` user after the repo is copied onto the VM and secrets exist
- `docker-compose.vm.yml`
  - Live-mode deployment bound to the Tailscale IP only

## Fast path

On the Ubuntu VM:

```bash
sudo bash bootstrap-ubuntu-worker.sh
sudo tailscale up
sudo -u worker git clone https://github.com/moltlaunch/cashclaw.git /home/worker/openclaw-crypto-worker
cd /home/worker/openclaw-crypto-worker
sudo mkdir -p /etc/openclaw-crypto-worker/secrets
sudo chmod 700 /etc/openclaw-crypto-worker/secrets
sudo sh -c 'printf "%s\n" "https://YOUR_BASE_RPC" > /etc/openclaw-crypto-worker/secrets/base_rpc_url.txt'
sudo sh -c 'openssl rand -hex 24 > /etc/openclaw-crypto-worker/secrets/crypto_worker_token.txt'
sudo sh -c 'printf "%s\n" "0xYOUR_BURNER_PRIVATE_KEY" > /etc/openclaw-crypto-worker/secrets/burner_private_key.txt'
sudo chmod 600 /etc/openclaw-crypto-worker/secrets/*.txt
sudo chown -R worker:worker /home/worker/openclaw-crypto-worker
sudo -u worker bash /home/worker/openclaw-crypto-worker/ops/vm/deploy-worker-host.sh
```

## Mac cutover

After deployment, on your Mac set only:

- `CRYPTO_WORKER_URL=http://TAILSCALE_IP:3777`
- `CRYPTO_WORKER_TOKEN=<contents of crypto_worker_token.txt>`

Then use:

```bash
/Users/treyharnden/Projects/cashclaw-security-review/integration/openclaw/crypto_worker status
/Users/treyharnden/Projects/cashclaw-security-review/integration/openclaw/crypto_worker policy
/Users/treyharnden/Projects/cashclaw-security-review/integration/openclaw/crypto_worker portfolio
```

## First live rollout

1. Fund gas only.
2. Verify `status`, `policy`, `portfolio`.
3. Leave the worker paused.
4. `resume`
5. Run one manual `$5` trade.
6. `pause`
7. Inspect history.

## Important limits

This still is not a general wallet daemon. It only supports the pinned `USDC/WETH` path on Base and enforces the hard risk caps already present in the worker code.
