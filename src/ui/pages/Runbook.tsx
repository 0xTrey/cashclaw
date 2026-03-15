export function Runbook() {
  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/10 bg-black/25 p-8">
        <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Operator runbook</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Separate host first, then small money.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
          The worker is designed so your Mac never needs the burner wallet key. Keep OpenClaw on your Mac, keep this
          worker on a separate VM or mini PC, and let OpenClaw talk to it through a narrow authenticated wrapper.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <StepPanel
          title="Host isolation"
          steps={[
            "Run the worker on a separate machine with no personal files, browser state, SSH agent forwarding, or synced drives.",
            "Bind the service to a Tailscale IP or localhost behind a Tailscale reverse proxy.",
            "Restrict egress to Base RPC, Tailscale, DNS, NTP, and OS updates.",
            "Store only the burner private key and RPC credentials on that worker host.",
          ]}
        />
        <StepPanel
          title="OpenClaw integration"
          steps={[
            "Create a dedicated OpenClaw agent named crypto-exec with its own small workspace.",
            "Keep Docker sandbox on for that agent and allowlist only the local crypto_worker wrapper.",
            "Store only CRYPTO_WORKER_URL and CRYPTO_WORKER_TOKEN on your Mac.",
            "Schedule at most one hourly trade intent per run after status and policy checks pass.",
          ]}
        />
      </div>

      <section className="rounded-[28px] border border-white/10 bg-black/25 p-6">
        <h2 className="text-lg font-semibold text-white">Rollout sequence</h2>
        <ol className="mt-4 space-y-3 text-sm leading-6 text-white/65">
          <li>1. Dry-run only. Confirm quotes, rejects, and pause/resume behavior with zero signing.</li>
          <li>2. Fund gas only. Verify policy rejects, auth, and approval hygiene before any swap is allowed.</li>
          <li>3. Trade with $5 for one week. Leave execution mode in `live` only after the earlier checks are stable.</li>
          <li>4. Raise to $50 only if the ledger stays clean and no secret-handling issues appear.</li>
        </ol>
      </section>
    </div>
  );
}

function StepPanel(props: { title: string; steps: string[] }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-black/25 p-6">
      <h2 className="text-lg font-semibold text-white">{props.title}</h2>
      <ul className="mt-4 space-y-3 text-sm leading-6 text-white/65">
        {props.steps.map((step) => (
          <li key={step} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
            {step}
          </li>
        ))}
      </ul>
    </section>
  );
}
