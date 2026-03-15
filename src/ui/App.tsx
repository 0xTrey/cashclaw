import { useEffect, useState } from "react";
import { api, type HealthData, type HistoryEntry, type PolicyData, type PortfolioData } from "./lib/api.js";
import { History } from "./pages/History.js";
import { Monitor } from "./pages/Monitor.js";
import { Policy } from "./pages/Policy.js";
import { Runbook } from "./pages/Runbook.js";

type Page = "monitor" | "policy" | "history" | "runbook";

const NAV: Array<{ id: Page; label: string }> = [
  { id: "monitor", label: "Monitor" },
  { id: "policy", label: "Policy" },
  { id: "history", label: "History" },
  { id: "runbook", label: "Runbook" },
];

export function App() {
  const [page, setPage] = useState<Page>("monitor");
  const [authorized, setAuthorized] = useState(Boolean(api.getStoredToken()));
  const [health, setHealth] = useState<HealthData | null>(null);
  const [policy, setPolicy] = useState<PolicyData | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadAll(): Promise<void> {
    try {
      const [nextHealth, nextPolicy, nextPortfolio, nextHistory] = await Promise.all([
        api.getHealth(),
        api.getPolicy(),
        api.getPortfolio(),
        api.getHistory(50),
      ]);
      setHealth(nextHealth);
      setPolicy(nextPolicy);
      setPortfolio(nextPortfolio);
      setHistory(nextHistory.entries);
      setError(null);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === "Unauthorized") {
        api.clearToken();
        setAuthorized(false);
        setHealth(null);
        setPolicy(null);
        setPortfolio(null);
        setHistory([]);
      } else {
        setError(loadError instanceof Error ? loadError.message : "Failed to load worker state.");
      }
    }
  }

  useEffect(() => {
    if (!authorized) {
      return;
    }

    void loadAll();
    const interval = window.setInterval(() => {
      void loadAll();
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [authorized]);

  async function handlePauseResume(): Promise<void> {
    if (!health) {
      return;
    }
    setBusy(true);
    try {
      if (health.paused) {
        await api.resume();
      } else {
        await api.pause();
      }
      await loadAll();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!authorized) {
    return <TokenGate onSubmit={(token) => {
      api.saveToken(token);
      setAuthorized(true);
    }} />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(71,208,170,0.18),_transparent_35%),linear-gradient(180deg,#091018,#05070b_55%,#040507)] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 py-5 lg:flex-row lg:gap-5">
        <aside className="mb-5 rounded-[30px] border border-white/10 bg-black/35 p-5 backdrop-blur lg:mb-0 lg:w-[280px] lg:shrink-0">
          <div className="rounded-[26px] border border-emerald-300/15 bg-emerald-300/10 p-5">
            <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-100/70">Separate-host sidecar</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-white">OpenClaw Crypto Worker</div>
            <p className="mt-3 text-sm leading-6 text-white/65">
              Deterministic Base execution. No marketplace inbox, no in-process LLM autonomy, no wallet export path.
            </p>
          </div>

          <nav className="mt-5 space-y-2">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition ${
                  page === item.id
                    ? "bg-white text-slate-950"
                    : "border border-white/6 bg-white/[0.03] text-white/68 hover:border-white/14 hover:bg-white/[0.06]"
                }`}
              >
                <span>{item.label}</span>
                {item.id === "history" && history.length > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${page === item.id ? "bg-slate-950/10" : "bg-white/8"}`}>
                    {history.length}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="mt-5 rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Session</div>
            <div className="mt-3 text-sm text-white/75">{health?.executionMode === "live" ? "Live signing enabled" : "Dry run only"}</div>
            <div className="mt-2 text-sm text-white/55">{health?.paused ? "Worker paused" : "Worker unpaused"}</div>
            <button
              onClick={() => {
                api.clearToken();
                setAuthorized(false);
              }}
              className="mt-4 rounded-full border border-white/12 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-white/55 transition hover:border-white/25 hover:text-white/80"
            >
              Forget token
            </button>
          </div>
        </aside>

        <main className="flex-1 rounded-[34px] border border-white/10 bg-black/30 p-5 backdrop-blur lg:p-8">
          {page === "monitor" && (
            <Monitor
              health={health}
              policy={policy}
              portfolio={portfolio}
              busy={busy}
              error={error}
              onPauseResume={handlePauseResume}
              onRefresh={loadAll}
            />
          )}
          {page === "policy" && <Policy policy={policy} />}
          {page === "history" && <History entries={history} />}
          {page === "runbook" && <Runbook />}
        </main>
      </div>
    </div>
  );
}

function TokenGate(props: { onSubmit: (token: string) => void }) {
  const [token, setToken] = useState("");

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#081017,#040508)] px-5 py-10 text-white">
      <div className="mx-auto max-w-4xl rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(102,221,190,0.18),_transparent_35%),rgba(5,7,10,0.88)] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] lg:p-12">
        <div className="text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">Authenticated operator dashboard</div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Enter the worker token to continue.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/65">
          Keep the dashboard behind Tailscale and use the same bearer token your OpenClaw `crypto_worker` wrapper uses.
          The browser never needs wallet material, RPC keys, or recovery phrases.
        </p>

        <form
          className="mt-8 max-w-2xl space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (token.trim()) {
              props.onSubmit(token);
            }
          }}
        >
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            placeholder="CRYPTO_WORKER_TOKEN"
            className="w-full rounded-[22px] border border-white/12 bg-black/30 px-5 py-4 text-white placeholder:text-white/30 focus:border-emerald-300/50 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
          >
            Unlock dashboard
          </button>
        </form>
      </div>
    </div>
  );
}
