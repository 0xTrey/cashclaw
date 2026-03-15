import type { HistoryEntry } from "../lib/api.js";

const LABELS: Record<string, string> = {
  quote: "Quote issued",
  quote_rejected: "Quote rejected",
  trade_rejected: "Trade rejected",
  trade_simulated: "Trade simulated",
  trade_executed: "Trade executed",
  policy_violation: "Policy violation",
  portfolio_snapshot: "Portfolio snapshot",
  pause: "Worker paused",
  resume: "Worker resumed",
};

export function History(props: { entries: HistoryEntry[] }) {
  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/10 bg-black/25 p-8">
        <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Ledger</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Append-only execution history.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
          Quotes, rejects, executions, pause events, and portfolio snapshots are written to a JSONL ledger so risk checks
          do not depend on prompt memory.
        </p>
      </section>

      <div className="space-y-3">
        {props.entries.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-black/25 p-8 text-center text-white/55">
            No ledger entries yet.
          </div>
        )}
        {props.entries.map((entry) => (
          <article key={entry.id} className="rounded-[28px] border border-white/10 bg-black/25 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-white/40">
                  {LABELS[entry.type] ?? entry.type}
                </div>
                <div className="mt-2 text-base font-semibold text-white">
                  {entry.request
                    ? `${entry.request.side.toUpperCase()} ${entry.request.pair} $${entry.request.notionalUsd.toFixed(2)}`
                    : entry.reason ?? "System event"}
                </div>
                {entry.reason && (
                  <p className="mt-2 max-w-3xl text-sm text-white/60">{entry.reason}</p>
                )}
              </div>
              <div className="text-right text-xs uppercase tracking-[0.22em] text-white/35">
                {new Date(entry.timestamp).toLocaleString()}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {entry.execution?.status && (
                <DataPoint label="Execution" value={entry.execution.status} />
              )}
              {typeof entry.pnlDeltaUsd === "number" && (
                <DataPoint label="PnL delta" value={`$${entry.pnlDeltaUsd.toFixed(2)}`} />
              )}
              {entry.execution?.transactionHash && (
                <DataPoint label="Swap tx" value={shorten(entry.execution.transactionHash)} />
              )}
              {entry.request?.sourceSessionId && (
                <DataPoint label="Session" value={entry.request.sourceSessionId} />
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function DataPoint(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/35">{props.label}</div>
      <div className="mt-2 font-mono text-sm text-white/80">{props.value}</div>
    </div>
  );
}

function shorten(value: string): string {
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}
