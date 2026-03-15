import type { Address } from "viem";

export const APP_NAME = "openclaw-crypto-worker";
export const APP_VERSION = "0.1.0";
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3777;
export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_NAME = "base";
export const ALLOWED_PAIR = "USDC/WETH" as const;

export const BASE_TOKENS = {
  // Pinned Base mainnet token addresses. Re-verify against official docs before changing.
  USDC: {
    symbol: "USDC",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    decimals: 6,
  },
  WETH: {
    symbol: "WETH",
    address: "0x4200000000000000000000000000000000000006" as Address,
    decimals: 18,
  },
} as const;

export const UNISWAP_BASE = {
  // Pinned official Uniswap Base deployment addresses for the single supported swap path.
  factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as Address,
  quoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as Address,
  swapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
  poolFee: 500,
} as const;

export const DEFAULT_HISTORY_LIMIT = 200;
