import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getLedgerPath } from "../config.js";
import type { LedgerEntry, LedgerSummary } from "./types.js";

function ensureLedgerDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
}

export function appendLedgerEntry(
  entry: Omit<LedgerEntry, "id">,
  env = process.env,
): LedgerEntry {
  const next: LedgerEntry = {
    id: randomUUID(),
    ...entry,
  };
  const ledgerPath = getLedgerPath(env);
  ensureLedgerDir(ledgerPath);
  fs.appendFileSync(ledgerPath, `${JSON.stringify(next)}\n`, { encoding: "utf8", mode: 0o600 });
  if (fs.existsSync(ledgerPath)) {
    fs.chmodSync(ledgerPath, 0o600);
  }
  return next;
}

export function loadLedger(limit?: number, env = process.env): LedgerEntry[] {
  const ledgerPath = getLedgerPath(env);
  if (!fs.existsSync(ledgerPath)) {
    return [];
  }

  const lines = fs.readFileSync(ledgerPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const entries = lines.map((line) => JSON.parse(line) as LedgerEntry);
  const sliced = typeof limit === "number" ? entries.slice(-limit) : entries;
  return sliced.reverse();
}

export function summarizeLedger(entries: LedgerEntry[], now = Date.now()): LedgerSummary {
  const cutoff = now - (24 * 60 * 60 * 1000);
  const recent = entries.filter((entry) => entry.timestamp >= cutoff);
  const executed = recent.filter((entry) => entry.type === "trade_executed");
  const rejections = recent.filter(
    (entry) => entry.type === "trade_rejected" || entry.type === "policy_violation",
  );

  return {
    tradeCount24h: executed.length,
    dailyNotionalUsd: Number(
      executed
        .reduce((sum, entry) => sum + (entry.request?.notionalUsd ?? 0), 0)
        .toFixed(2),
    ),
    pnlUsd24h: Number(
      executed
        .reduce((sum, entry) => sum + (entry.pnlDeltaUsd ?? 0), 0)
        .toFixed(2),
    ),
    rejectionCount24h: rejections.length,
    lastExecutionAt: executed.length > 0
      ? Math.max(...executed.map((entry) => entry.timestamp))
      : null,
  };
}
