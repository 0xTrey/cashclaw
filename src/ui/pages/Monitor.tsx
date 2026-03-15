import type { HealthData, PolicyData, PortfolioData } from "../lib/api.js";

interface MonitorProps {
  health: HealthData | null;
  policy: PolicyData | null;
  portfolio: PortfolioData | null;
  busy: boolean;
  error: string | null;
  onPauseResume: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

function StatCard(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
      <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">{props.label}</div>
      <div className="mt-3 text-2xl font-semibold text-white">{props.value}</div>
      {props.hint && <div className="mt-2 text-sm text-white/55">{props.hint}</div>}
    </div>
  );
}

export function Monitor(props: MonitorProps) {
  if (!props.health || !props.policy || !props.portfolio) {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/30 p-10 text-center text-white/60">
        Loading worker state...
      </div>
    );
  }

  const { health, policy, portfolio } = props;
  const paused = health.paused;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(95,210,185,0.22),_transparent_40%),linear-gradient(135deg,rgba(19,24,31,0.96),rgba(8,10,14,0.96))] p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-emerald-200/70">OpenClaw Crypto Worker</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Bounded Base execution only.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
              This worker can quote and execute only pinned `USDC/WETH` swaps on Base. It never exposes wallet secrets,
              generic calldata, or arbitrary contract access through the dashboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void props.onRefresh()}
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/30 hover:bg-white/10"
            >
              Refresh
            </button>
            <button
              onClick={() => void props.onPauseResume()}
              disabled={props.busy}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                paused
                  ? "bg-emerald-400 text-slate-900 hover:bg-emerald-300"
                  : "bg-amber-300 text-slate-900 hover:bg-amber-200"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {props.busy ? "Working..." : paused ? "Resume worker" : "Pause worker"}
            </button>
          </div>
        </div>
        {props.error && (
          <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {props.error}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Mode" value={health.executionMode === "dry-run" ? "Dry run" : "Live"} hint={paused ? "Paused" : "Active"} />
        <StatCard label="Portfolio" value={`$${portfolio.portfolio.totalUsd.toFixed(2)}`} hint={`WETH exposure ${portfolio.portfolio.wethExposurePct.toFixed(1)}%`} />
        <StatCard label="24h notional" value={`$${policy.policySnapshot.rolling24h.dailyNotionalUsd.toFixed(2)}`} hint={`${policy.policySnapshot.rolling24h.tradeCount24h} trades`} />
        <StatCard label="24h PnL" value={`$${policy.policySnapshot.rolling24h.pnlUsd24h.toFixed(2)}`} hint={`${policy.policySnapshot.rolling24h.rejectionCount24h} rejects`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr,0.9fr]">
        <div className="rounded-[28px] border border-white/10 bg-black/25 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Portfolio</h2>
            <div className="text-xs uppercase tracking-[0.22em] text-white/40">
              Updated {new Date(portfolio.portfolio.asOf).toLocaleTimeString()}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <AssetCard
              label="Native ETH"
              amount={Number(portfolio.portfolio.nativeEth.formatted).toFixed(6)}
              usd={Number(portfolio.portfolio.nativeEth.formatted) * portfolio.portfolio.referencePriceUsd}
            />
            <AssetCard
              label="USDC"
              amount={portfolio.portfolio.balances.USDC.formatted}
              usd={portfolio.portfolio.balances.USDC.usdValue}
            />
            <AssetCard
              label="WETH"
              amount={portfolio.portfolio.balances.WETH.formatted}
              usd={portfolio.portfolio.balances.WETH.usdValue}
            />
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-black/25 p-6">
          <div className="mb-4 text-lg font-semibold text-white">Worker posture</div>
          <dl className="space-y-3 text-sm">
            <Detail label="Wallet" value={trimAddress(health.walletAddress)} />
            <Detail label="Pair" value={policy.policySnapshot.allowedPairs.join(", ")} />
            <Detail label="WETH reference" value={`$${portfolio.portfolio.referencePriceUsd.toFixed(2)}`} />
            <Detail label="Max single trade" value={`$${policy.policySnapshot.risk.maxTradeUsd.toFixed(2)}`} />
            <Detail label="Max 24h notional" value={`$${policy.policySnapshot.risk.maxDailyNotionalUsd.toFixed(2)}`} />
            <Detail label="Gas reserve floor" value={`${policy.policySnapshot.risk.minGasReserveEth} ETH`} />
          </dl>
        </div>
      </section>
    </div>
  );
}

function AssetCard(props: { label: string; amount: string; usd: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">{props.label}</div>
      <div className="mt-3 text-xl font-semibold text-white">{props.amount}</div>
      <div className="mt-2 text-sm text-white/55">${props.usd.toFixed(2)}</div>
    </div>
  );
}

function Detail(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <dt className="text-white/45">{props.label}</dt>
      <dd className="font-mono text-[13px] text-white/80">{props.value}</dd>
    </div>
  );
}

function trimAddress(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}
