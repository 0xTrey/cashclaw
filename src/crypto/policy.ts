import type {
  LedgerSummary,
  PolicySnapshot,
  PortfolioSnapshot,
  QuoteRequest,
  TradeIntentRequest,
  WorkerConfig,
} from "./types.js";

export function buildPolicySnapshot(
  config: WorkerConfig,
  summary: LedgerSummary,
): PolicySnapshot {
  return {
    paused: config.paused,
    executionMode: config.executionMode,
    chainId: config.chain.id,
    allowedPairs: [...config.allowedPairs],
    walletAddress: config.wallet.address,
    risk: { ...config.risk },
    rolling24h: summary,
  };
}

export function validateQuoteRequest(
  config: WorkerConfig,
  request: QuoteRequest,
): string | null {
  if (!config.allowedPairs.includes(request.pair)) {
    return `Unsupported pair "${request.pair}". Only ${config.pair} is enabled.`;
  }

  if (request.side !== "buy" && request.side !== "sell") {
    return `Unsupported side "${request.side}". Use "buy" or "sell".`;
  }

  if (!Number.isFinite(request.notionalUsd) || request.notionalUsd <= 0) {
    return "notionalUsd must be a positive number.";
  }

  if (request.notionalUsd > config.risk.maxTradeUsd) {
    return `Trade notional exceeds hard cap of $${config.risk.maxTradeUsd.toFixed(2)}.`;
  }

  return null;
}

function projectWethExposurePct(
  portfolio: PortfolioSnapshot,
  request: QuoteRequest,
): number {
  if (portfolio.totalUsd <= 0) {
    return 0;
  }

  const currentWethUsd = portfolio.balances.WETH.usdValue;
  const nextWethUsd = request.side === "buy"
    ? currentWethUsd + request.notionalUsd
    : Math.max(0, currentWethUsd - request.notionalUsd);

  return (nextWethUsd / portfolio.totalUsd) * 100;
}

export function validateTradeIntent(
  config: WorkerConfig,
  request: TradeIntentRequest,
  summary: LedgerSummary,
  portfolio: PortfolioSnapshot,
): string | null {
  const quoteValidation = validateQuoteRequest(config, request);
  if (quoteValidation) {
    return quoteValidation;
  }

  if (config.paused) {
    return "Worker is paused. Resume explicitly before submitting live trade intents.";
  }

  if (request.source !== "openclaw") {
    return `Unsupported source "${request.source}".`;
  }

  if (!request.sourceSessionId.trim()) {
    return "sourceSessionId is required.";
  }

  if (!request.thesis.trim()) {
    return "thesis is required.";
  }

  if (summary.tradeCount24h >= config.risk.maxTrades24h) {
    return `Trade count limit reached for the last 24h (${config.risk.maxTrades24h}).`;
  }

  if (summary.dailyNotionalUsd + request.notionalUsd > config.risk.maxDailyNotionalUsd) {
    return `Daily notional limit would be exceeded (cap $${config.risk.maxDailyNotionalUsd.toFixed(2)}).`;
  }

  if (summary.pnlUsd24h <= -config.risk.killSwitchLossUsd24h) {
    return `Kill switch engaged after 24h loss of $${Math.abs(summary.pnlUsd24h).toFixed(2)}.`;
  }

  const projectedExposure = projectWethExposurePct(portfolio, request);
  if (projectedExposure > config.risk.maxWethExposurePct) {
    return `Projected WETH exposure ${projectedExposure.toFixed(1)}% exceeds cap of ${config.risk.maxWethExposurePct}%.`;
  }

  if (Number(portfolio.nativeEth.formatted) < config.risk.minGasReserveEth) {
    return `Native gas reserve is below ${config.risk.minGasReserveEth} ETH.`;
  }

  return null;
}
