import type { Address, Hex } from "viem";

export type TradePair = "USDC/WETH";
export type TradeSide = "buy" | "sell";
export type ExecutionMode = "dry-run" | "live";
export type WorkerSource = "openclaw";

export interface TokenConfig {
  symbol: "USDC" | "WETH";
  address: Address;
  decimals: number;
}

export interface RiskConfig {
  maxTradeUsd: number;
  maxDailyNotionalUsd: number;
  maxTrades24h: number;
  maxWethExposurePct: number;
  maxSlippageBps: number;
  minGasReserveEth: number;
  killSwitchLossUsd24h: number;
}

export interface WorkerConfig {
  appName: string;
  executionMode: ExecutionMode;
  chain: {
    id: number;
    name: string;
    rpcUrl: string;
  };
  server: {
    host: string;
    port: number;
  };
  wallet: {
    address: Address;
    privateKeyEnvVar: string;
  };
  authTokenHash: string;
  paused: boolean;
  pair: TradePair;
  allowedPairs: TradePair[];
  tokens: Record<"USDC" | "WETH", TokenConfig>;
  uniswap: {
    factory: Address;
    quoterV2: Address;
    swapRouter02: Address;
    routerAllowlist: Address[];
    spenderAllowlist: Address[];
    poolFee: number;
  };
  risk: RiskConfig;
  historyLimit: number;
}

export interface QuoteRequest {
  pair: TradePair;
  side: TradeSide;
  notionalUsd: number;
}

export interface TradeIntentRequest extends QuoteRequest {
  thesis: string;
  source: WorkerSource;
  sourceSessionId: string;
}

export interface AmountQuote {
  symbol: "USDC" | "WETH";
  raw: string;
  formatted: string;
  usdValue: number;
}

export interface ExecutionPlan {
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  router: Address;
  spender: Address;
  quoter: Address;
  recipient: Address;
  poolFee: number;
}

export interface QuoteData {
  pair: TradePair;
  side: TradeSide;
  notionalUsd: number;
  amountIn: AmountQuote;
  amountOut: AmountQuote;
  minAmountOut: AmountQuote;
  referencePriceUsd: number;
  slippageBps: number;
  executionPlan: ExecutionPlan;
}

export interface ExecutionResult {
  mode: ExecutionMode;
  status: "simulated" | "submitted" | "confirmed" | "failed";
  transactionHash?: Hex;
  approvalHash?: Hex;
  revokeHash?: Hex;
  amountIn: AmountQuote;
  amountOut: AmountQuote;
  gasUsed?: string;
  blockNumber?: string;
  error?: string;
}

export interface PortfolioSnapshot {
  walletAddress: Address;
  asOf: number;
  nativeEth: {
    raw: string;
    formatted: string;
  };
  balances: {
    USDC: AmountQuote;
    WETH: AmountQuote;
  };
  referencePriceUsd: number;
  totalUsd: number;
  wethExposurePct: number;
}

export interface LedgerSummary {
  tradeCount24h: number;
  dailyNotionalUsd: number;
  pnlUsd24h: number;
  rejectionCount24h: number;
  lastExecutionAt: number | null;
}

export interface PolicySnapshot {
  paused: boolean;
  executionMode: ExecutionMode;
  chainId: number;
  allowedPairs: TradePair[];
  walletAddress: Address;
  risk: RiskConfig;
  rolling24h: LedgerSummary;
}

export interface WorkerResponse {
  accepted: boolean;
  reason?: string;
  quote?: QuoteData;
  execution?: ExecutionResult;
  policySnapshot: PolicySnapshot;
}

export interface HealthResponse {
  appName: string;
  version: string;
  chainId: number;
  chainName: string;
  executionMode: ExecutionMode;
  paused: boolean;
  walletAddress: Address;
  startedAt: number;
}

export interface TradingService {
  getPortfolio(config: WorkerConfig): Promise<PortfolioSnapshot>;
  quote(config: WorkerConfig, request: QuoteRequest): Promise<QuoteData>;
  execute(
    config: WorkerConfig,
    request: TradeIntentRequest,
    quote: QuoteData,
  ): Promise<ExecutionResult>;
}

export interface LedgerEntry {
  id: string;
  timestamp: number;
  type:
    | "quote"
    | "quote_rejected"
    | "trade_rejected"
    | "trade_simulated"
    | "trade_executed"
    | "policy_violation"
    | "pause"
    | "resume"
    | "portfolio_snapshot";
  request?: QuoteRequest | TradeIntentRequest;
  reason?: string;
  quote?: QuoteData;
  execution?: ExecutionResult;
  policySnapshot?: PolicySnapshot;
  portfolio?: PortfolioSnapshot;
  pnlDeltaUsd?: number;
}
