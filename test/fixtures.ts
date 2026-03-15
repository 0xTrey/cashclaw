import { hashAuthToken } from "../src/config.js";
import { BASE_TOKENS, UNISWAP_BASE } from "../src/crypto/constants.js";
import type {
  ExecutionResult,
  PortfolioSnapshot,
  QuoteData,
  TradeIntentRequest,
  WorkerConfig,
} from "../src/crypto/types.js";

export const TEST_TOKEN = "test-token";

export function createConfig(): WorkerConfig {
  return {
    appName: "openclaw-crypto-worker",
    executionMode: "dry-run",
    chain: {
      id: 8453,
      name: "base",
      rpcUrl: "https://base-rpc.example",
    },
    server: {
      host: "127.0.0.1",
      port: 0,
    },
    wallet: {
      address: "0x1111111111111111111111111111111111111111",
      privateKeyEnvVar: "BURNER_PRIVATE_KEY",
    },
    authTokenHash: hashAuthToken(TEST_TOKEN),
    paused: true,
    pair: "USDC/WETH",
    allowedPairs: ["USDC/WETH"],
    tokens: {
      USDC: { ...BASE_TOKENS.USDC },
      WETH: { ...BASE_TOKENS.WETH },
    },
    uniswap: {
      factory: UNISWAP_BASE.factory,
      quoterV2: UNISWAP_BASE.quoterV2,
      swapRouter02: UNISWAP_BASE.swapRouter02,
      routerAllowlist: [UNISWAP_BASE.swapRouter02],
      spenderAllowlist: [UNISWAP_BASE.swapRouter02],
      poolFee: UNISWAP_BASE.poolFee,
    },
    risk: {
      maxTradeUsd: 5,
      maxDailyNotionalUsd: 15,
      maxTrades24h: 3,
      maxWethExposurePct: 50,
      maxSlippageBps: 100,
      minGasReserveEth: 0.0005,
      killSwitchLossUsd24h: 10,
    },
    historyLimit: 200,
  };
}

export function createPortfolio(): PortfolioSnapshot {
  return {
    walletAddress: "0x1111111111111111111111111111111111111111",
    asOf: Date.now(),
    nativeEth: {
      raw: "1000000000000000",
      formatted: "0.001",
    },
    balances: {
      USDC: {
        symbol: "USDC",
        raw: "50000000",
        formatted: "50",
        usdValue: 50,
      },
      WETH: {
        symbol: "WETH",
        raw: "0",
        formatted: "0",
        usdValue: 0,
      },
    },
    referencePriceUsd: 3000,
    totalUsd: 53,
    wethExposurePct: 0,
  };
}

export function createQuote(): QuoteData {
  return {
    pair: "USDC/WETH",
    side: "buy",
    notionalUsd: 5,
    amountIn: {
      symbol: "USDC",
      raw: "5000000",
      formatted: "5",
      usdValue: 5,
    },
    amountOut: {
      symbol: "WETH",
      raw: "1666666666666666",
      formatted: "0.001666666666666666",
      usdValue: 5,
    },
    minAmountOut: {
      symbol: "WETH",
      raw: "1650000000000000",
      formatted: "0.00165",
      usdValue: 4.95,
    },
    referencePriceUsd: 3000,
    slippageBps: 100,
    executionPlan: {
      chainId: 8453,
      tokenIn: BASE_TOKENS.USDC.address,
      tokenOut: BASE_TOKENS.WETH.address,
      router: UNISWAP_BASE.swapRouter02,
      spender: UNISWAP_BASE.swapRouter02,
      quoter: UNISWAP_BASE.quoterV2,
      recipient: "0x1111111111111111111111111111111111111111",
      poolFee: UNISWAP_BASE.poolFee,
    },
  };
}

export function createTradeIntent(): TradeIntentRequest {
  return {
    pair: "USDC/WETH",
    side: "buy",
    notionalUsd: 5,
    thesis: "Buy a tiny amount after policy checks pass.",
    source: "openclaw",
    sourceSessionId: "session-1",
  };
}

export function createExecutionResult(status: ExecutionResult["status"] = "simulated"): ExecutionResult {
  const quote = createQuote();
  return {
    mode: "dry-run",
    status,
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
  };
}
