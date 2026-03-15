const BASE = "";
const TOKEN_KEY = "openclaw-crypto-worker.token";

function getToken(): string {
  return window.localStorage.getItem(TOKEN_KEY) ?? "";
}

export function saveToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token.trim());
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export interface HealthData {
  appName: string;
  version: string;
  chainId: number;
  chainName: string;
  executionMode: "dry-run" | "live";
  paused: boolean;
  walletAddress: string;
  startedAt: number;
}

export interface PolicyData {
  policySnapshot: {
    paused: boolean;
    executionMode: "dry-run" | "live";
    chainId: number;
    walletAddress: string;
    allowedPairs: string[];
    risk: {
      maxTradeUsd: number;
      maxDailyNotionalUsd: number;
      maxTrades24h: number;
      maxWethExposurePct: number;
      maxSlippageBps: number;
      minGasReserveEth: number;
      killSwitchLossUsd24h: number;
    };
    rolling24h: {
      tradeCount24h: number;
      dailyNotionalUsd: number;
      pnlUsd24h: number;
      rejectionCount24h: number;
      lastExecutionAt: number | null;
    };
  };
  allowlists: {
    tokens: string[];
    routers: string[];
    spenders: string[];
  };
}

export interface PortfolioData {
  portfolio: {
    walletAddress: string;
    asOf: number;
    nativeEth: {
      raw: string;
      formatted: string;
    };
    balances: {
      USDC: {
        symbol: "USDC";
        formatted: string;
        usdValue: number;
      };
      WETH: {
        symbol: "WETH";
        formatted: string;
        usdValue: number;
      };
    };
    referencePriceUsd: number;
    totalUsd: number;
    wethExposurePct: number;
  };
  policySnapshot: PolicyData["policySnapshot"];
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  type: string;
  reason?: string;
  pnlDeltaUsd?: number;
  request?: {
    side: "buy" | "sell";
    pair: string;
    notionalUsd: number;
    thesis?: string;
    sourceSessionId?: string;
  };
  execution?: {
    mode: "dry-run" | "live";
    status: string;
    transactionHash?: string;
    approvalHash?: string;
    revokeHash?: string;
    error?: string;
  };
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${getToken()}`);
  if (body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(payload.error ?? `Request failed with ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  getStoredToken: getToken,
  saveToken,
  clearToken,
  getHealth: () => request<HealthData>("GET", "/api/health"),
  getPolicy: () => request<PolicyData>("GET", "/api/policy"),
  getPortfolio: () => request<PortfolioData>("GET", "/api/portfolio"),
  getHistory: (limit = 50) => request<{ entries: HistoryEntry[] }>("GET", `/api/history?limit=${limit}`),
  pause: () => request<{ accepted: boolean }>("POST", "/api/pause"),
  resume: () => request<{ accepted: boolean }>("POST", "/api/resume"),
};
