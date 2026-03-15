import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import {
  ALLOWED_PAIR,
  APP_NAME,
  BASE_CHAIN_ID,
  BASE_CHAIN_NAME,
  BASE_TOKENS,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_HOST,
  DEFAULT_PORT,
  UNISWAP_BASE,
} from "./crypto/constants.js";
import type { RiskConfig, WorkerConfig } from "./crypto/types.js";

const APP_HOME_DIR = ".openclaw-crypto-worker";
const CONFIG_FILE = "config.json";
const LEDGER_FILE = "ledger.jsonl";

const DEFAULT_RISK: RiskConfig = {
  maxTradeUsd: 5,
  maxDailyNotionalUsd: 15,
  maxTrades24h: 3,
  maxWethExposurePct: 50,
  maxSlippageBps: 100,
  minGasReserveEth: 0.0005,
  killSwitchLossUsd24h: 10,
};

function readValueOrFile(key: string, env = process.env): string | undefined {
  const direct = env[key]?.trim();
  if (direct) {
    return direct;
  }

  const filePath = env[`${key}_FILE`]?.trim();
  if (!filePath) {
    return undefined;
  }

  return fs.readFileSync(filePath, "utf8").trim();
}

function getStateDirFromEnv(env = process.env): string {
  return env.OPENCLAW_CRYPTO_WORKER_HOME
    ? path.resolve(env.OPENCLAW_CRYPTO_WORKER_HOME)
    : path.join(os.homedir(), APP_HOME_DIR);
}

export function getStateDir(env = process.env): string {
  return getStateDirFromEnv(env);
}

export function getConfigPath(env = process.env): string {
  return path.join(getStateDirFromEnv(env), CONFIG_FILE);
}

export function getLedgerPath(env = process.env): string {
  return path.join(getStateDirFromEnv(env), LEDGER_FILE);
}

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function atomicWriteJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

function getWalletAddressFromEnv(env = process.env): Address {
  const privateKey = readValueOrFile("BURNER_PRIVATE_KEY", env);
  if (privateKey) {
    return privateKeyToAccount(privateKey as `0x${string}`).address;
  }

  const walletAddress = readValueOrFile("BURNER_WALLET_ADDRESS", env);
  if (walletAddress) {
    return walletAddress as Address;
  }

  throw new Error(
    "Missing wallet material. Set BURNER_PRIVATE_KEY or BURNER_WALLET_ADDRESS on the worker host.",
  );
}

export function buildDefaultConfig(env = process.env): WorkerConfig {
  const authToken = readValueOrFile("CRYPTO_WORKER_TOKEN", env);
  const rpcUrl = readValueOrFile("BASE_RPC_URL", env);

  if (!authToken?.trim()) {
    throw new Error("Missing CRYPTO_WORKER_TOKEN for initial worker bootstrap.");
  }

  if (!rpcUrl?.trim()) {
    throw new Error("Missing BASE_RPC_URL for initial worker bootstrap.");
  }

  const executionMode = env.OPENCLAW_CRYPTO_WORKER_MODE === "live" ? "live" : "dry-run";
  const port = Number.parseInt(env.OPENCLAW_CRYPTO_WORKER_PORT ?? `${DEFAULT_PORT}`, 10);

  return {
    appName: APP_NAME,
    executionMode,
    chain: {
      id: BASE_CHAIN_ID,
      name: BASE_CHAIN_NAME,
      rpcUrl,
    },
    server: {
      host: env.OPENCLAW_CRYPTO_WORKER_HOST ?? DEFAULT_HOST,
      port: Number.isFinite(port) ? port : DEFAULT_PORT,
    },
    wallet: {
      address: getWalletAddressFromEnv(env),
      privateKeyEnvVar: "BURNER_PRIVATE_KEY",
    },
    authTokenHash: hashAuthToken(authToken),
    paused: true,
    pair: ALLOWED_PAIR,
    allowedPairs: [ALLOWED_PAIR],
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
    risk: { ...DEFAULT_RISK },
    historyLimit: DEFAULT_HISTORY_LIMIT,
  };
}

export function readWorkerSecret(key: string, env = process.env): string | undefined {
  return readValueOrFile(key, env);
}

export function saveConfig(config: WorkerConfig, env = process.env): void {
  atomicWriteJson(getConfigPath(env), config);
}

export function loadConfig(env = process.env): WorkerConfig | null {
  const configPath = getConfigPath(env);
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as WorkerConfig;
    return parsed;
  } catch {
    return null;
  }
}

export function ensureConfig(env = process.env): WorkerConfig {
  const existing = loadConfig(env);
  if (existing) {
    return existing;
  }

  const config = buildDefaultConfig(env);
  saveConfig(config, env);
  return config;
}

export function savePartialConfig(
  partial: Partial<WorkerConfig>,
  env = process.env,
): WorkerConfig {
  const next = {
    ...ensureConfig(env),
    ...partial,
  };
  saveConfig(next, env);
  return next;
}

export function updatePausedState(paused: boolean, env = process.env): WorkerConfig {
  const current = ensureConfig(env);
  const next: WorkerConfig = {
    ...current,
    paused,
  };
  saveConfig(next, env);
  return next;
}
