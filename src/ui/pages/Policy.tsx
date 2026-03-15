import type { ReactNode } from "react";
import type { PolicyData } from "../lib/api.js";

export function Policy(props: { policy: PolicyData | null }) {
  if (!props.policy) {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/30 p-10 text-center text-white/60">
        Loading hard policy...
      </div>
    );
  }

  const { policySnapshot, allowlists } = props.policy;
  const risk = policySnapshot.risk;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/10 bg-black/25 p-8">
        <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Hard policy</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Deterministic limits, not prompt text.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
          OpenClaw can only submit structured intents. This worker enforces pair, size, daily notional, exposure, slippage,
          and loss limits in code before any signing path is reached.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Risk caps">
          <Rule label="Per-trade cap" value={`$${risk.maxTradeUsd.toFixed(2)}`} />
          <Rule label="24h notional cap" value={`$${risk.maxDailyNotionalUsd.toFixed(2)}`} />
          <Rule label="24h trade count" value={`${risk.maxTrades24h}`} />
          <Rule label="WETH exposure cap" value={`${risk.maxWethExposurePct}%`} />
          <Rule label="Slippage ceiling" value={`${risk.maxSlippageBps} bps`} />
          <Rule label="Gas reserve floor" value={`${risk.minGasReserveEth} ETH`} />
          <Rule label="24h loss kill switch" value={`$${risk.killSwitchLossUsd24h.toFixed(2)}`} />
        </Panel>

        <Panel title="Current posture">
          <Rule label="Mode" value={policySnapshot.executionMode} />
          <Rule label="Paused" value={policySnapshot.paused ? "true" : "false"} />
          <Rule label="Chain ID" value={`${policySnapshot.chainId}`} />
          <Rule label="Allowed pair" value={policySnapshot.allowedPairs.join(", ")} />
          <Rule label="24h trades" value={`${policySnapshot.rolling24h.tradeCount24h}`} />
          <Rule label="24h notional" value={`$${policySnapshot.rolling24h.dailyNotionalUsd.toFixed(2)}`} />
          <Rule label="24h PnL" value={`$${policySnapshot.rolling24h.pnlUsd24h.toFixed(2)}`} />
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ListPanel title="Token allowlist" items={allowlists.tokens} />
        <ListPanel title="Router allowlist" items={allowlists.routers} />
        <ListPanel title="Spender allowlist" items={allowlists.spenders} />
      </section>
    </div>
  );
}

function Panel(props: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-black/25 p-6">
      <h2 className="text-lg font-semibold text-white">{props.title}</h2>
      <div className="mt-4 space-y-3">{props.children}</div>
    </div>
  );
}

function Rule(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <span className="text-sm text-white/50">{props.label}</span>
      <span className="font-mono text-sm text-white/80">{props.value}</span>
    </div>
  );
}

function ListPanel(props: { title: string; items: string[] }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-black/25 p-6">
      <h2 className="text-lg font-semibold text-white">{props.title}</h2>
      <div className="mt-4 space-y-3">
        {props.items.map((item) => (
          <div key={item} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 font-mono text-sm text-white/80">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
