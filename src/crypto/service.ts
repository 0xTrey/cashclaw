import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { readWorkerSecret } from "../config.js";
import type {
  AmountQuote,
  ExecutionResult,
  PortfolioSnapshot,
  QuoteData,
  QuoteRequest,
  TradeIntentRequest,
  TradingService,
  WorkerConfig,
} from "./types.js";

const FACTORY_ABI = [
  {
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    name: "getPool",
    outputs: [{ name: "pool", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const QUOTER_V2_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    name: "quoteExactInputSingle",
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInputSingle",
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

function toAmountQuote(
  symbol: "USDC" | "WETH",
  raw: bigint,
  decimals: number,
  usdValue: number,
): AmountQuote {
  return {
    symbol,
    raw: raw.toString(),
    formatted: formatUnits(raw, decimals),
    usdValue: Number(usdValue.toFixed(4)),
  };
}

function slippageFloor(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}

function parseUsdAmount(value: number, decimals: number): bigint {
  return parseUnits(value.toFixed(decimals), decimals);
}

function getPrivateKey(envVarName: string, env = process.env): Hex | null {
  const value = readWorkerSecret(envVarName, env);
  return value ? value as Hex : null;
}

function assertAllowedExecutionPlan(config: WorkerConfig, quote: QuoteData): void {
  const { executionPlan } = quote;
  if (!config.uniswap.routerAllowlist.includes(executionPlan.router)) {
    throw new Error(`Router ${executionPlan.router} is not allowlisted.`);
  }
  if (!config.uniswap.spenderAllowlist.includes(executionPlan.spender)) {
    throw new Error(`Spender ${executionPlan.spender} is not allowlisted.`);
  }
  if (executionPlan.chainId !== config.chain.id) {
    throw new Error(`Unexpected chain ${executionPlan.chainId}.`);
  }
  if (executionPlan.tokenIn !== config.tokens.USDC.address && executionPlan.tokenIn !== config.tokens.WETH.address) {
    throw new Error(`Unexpected tokenIn ${executionPlan.tokenIn}.`);
  }
  if (executionPlan.tokenOut !== config.tokens.USDC.address && executionPlan.tokenOut !== config.tokens.WETH.address) {
    throw new Error(`Unexpected tokenOut ${executionPlan.tokenOut}.`);
  }
}

class ViemTradingService implements TradingService {
  private poolValidated = false;
  private referencePriceCache: { value: number; fetchedAt: number } | null = null;

  constructor(private readonly env = process.env) {}

  private createClients(config: WorkerConfig) {
    const transport = http(config.chain.rpcUrl);
    const publicClient = createPublicClient({
      chain: base,
      transport,
    });
    const privateKey = getPrivateKey(config.wallet.privateKeyEnvVar, this.env);

    if (!privateKey) {
      return { publicClient, account: null, walletClient: null };
    }

    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport,
    });

    return { publicClient, account, walletClient };
  }

  private async ensurePool(config: WorkerConfig): Promise<void> {
    if (this.poolValidated) {
      return;
    }

    const { publicClient } = this.createClients(config);
    const pool = await publicClient.readContract({
      abi: FACTORY_ABI,
      address: config.uniswap.factory,
      functionName: "getPool",
      args: [
        config.tokens.USDC.address,
        config.tokens.WETH.address,
        config.uniswap.poolFee,
      ],
    });

    if (pool === zeroAddress) {
      throw new Error("Pinned Uniswap V3 pool was not found on Base.");
    }

    this.poolValidated = true;
  }

  private async getReferencePriceUsd(config: WorkerConfig): Promise<number> {
    const now = Date.now();
    if (this.referencePriceCache && now - this.referencePriceCache.fetchedAt < 15_000) {
      return this.referencePriceCache.value;
    }

    const { publicClient } = this.createClients(config);
    const oneWeth = parseUnits("1", config.tokens.WETH.decimals);
    const quoteResult = await publicClient.readContract({
      abi: QUOTER_V2_ABI,
      address: config.uniswap.quoterV2,
      functionName: "quoteExactInputSingle",
      args: [{
        tokenIn: config.tokens.WETH.address,
        tokenOut: config.tokens.USDC.address,
        amountIn: oneWeth,
        fee: config.uniswap.poolFee,
        sqrtPriceLimitX96: 0n,
      }],
    }) as readonly [bigint, bigint, number, bigint];
    const amountOut = quoteResult[0];

    const value = Number(formatUnits(amountOut, config.tokens.USDC.decimals));
    this.referencePriceCache = { value, fetchedAt: now };
    return value;
  }

  private async getTokenBalance(
    config: WorkerConfig,
    token: "USDC" | "WETH",
  ): Promise<bigint> {
    const { publicClient } = this.createClients(config);
    return publicClient.readContract({
      abi: erc20Abi,
      address: config.tokens[token].address,
      functionName: "balanceOf",
      args: [config.wallet.address],
    });
  }

  private async getNativeBalance(config: WorkerConfig): Promise<bigint> {
    const { publicClient } = this.createClients(config);
    return publicClient.getBalance({ address: config.wallet.address });
  }

  private async getAllowance(
    config: WorkerConfig,
    tokenAddress: Address,
    spender: Address,
  ): Promise<bigint> {
    const { publicClient, account } = this.createClients(config);
    if (!account) {
      return 0n;
    }
    return publicClient.readContract({
      abi: erc20Abi,
      address: tokenAddress,
      functionName: "allowance",
      args: [account.address, spender],
    });
  }

  async getPortfolio(config: WorkerConfig): Promise<PortfolioSnapshot> {
    await this.ensurePool(config);
    const [nativeWei, usdcRaw, wethRaw, referencePriceUsd] = await Promise.all([
      this.getNativeBalance(config),
      this.getTokenBalance(config, "USDC"),
      this.getTokenBalance(config, "WETH"),
      this.getReferencePriceUsd(config),
    ]);

    const nativeEth = Number(formatUnits(nativeWei, 18));
    const nativeUsd = nativeEth * referencePriceUsd;
    const usdcUsd = Number(formatUnits(usdcRaw, config.tokens.USDC.decimals));
    const wethFormatted = Number(formatUnits(wethRaw, config.tokens.WETH.decimals));
    const wethUsd = wethFormatted * referencePriceUsd;
    const totalUsd = Number((nativeUsd + usdcUsd + wethUsd).toFixed(4));
    const wethExposurePct = totalUsd > 0 ? Number(((wethUsd / totalUsd) * 100).toFixed(2)) : 0;

    return {
      walletAddress: config.wallet.address,
      asOf: Date.now(),
      nativeEth: {
        raw: nativeWei.toString(),
        formatted: formatUnits(nativeWei, 18),
      },
      balances: {
        USDC: toAmountQuote("USDC", usdcRaw, config.tokens.USDC.decimals, usdcUsd),
        WETH: toAmountQuote("WETH", wethRaw, config.tokens.WETH.decimals, wethUsd),
      },
      referencePriceUsd: Number(referencePriceUsd.toFixed(4)),
      totalUsd,
      wethExposurePct,
    };
  }

  async quote(config: WorkerConfig, request: QuoteRequest): Promise<QuoteData> {
    await this.ensurePool(config);
    const { publicClient } = this.createClients(config);
    const referencePriceUsd = await this.getReferencePriceUsd(config);

    const tokenIn = request.side === "buy" ? config.tokens.USDC : config.tokens.WETH;
    const tokenOut = request.side === "buy" ? config.tokens.WETH : config.tokens.USDC;
    const amountInRaw = request.side === "buy"
      ? parseUsdAmount(request.notionalUsd, tokenIn.decimals)
      : parseUsdAmount(request.notionalUsd / referencePriceUsd, tokenIn.decimals);

    const quoteResult = await publicClient.readContract({
      abi: QUOTER_V2_ABI,
      address: config.uniswap.quoterV2,
      functionName: "quoteExactInputSingle",
      args: [{
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn: amountInRaw,
        fee: config.uniswap.poolFee,
        sqrtPriceLimitX96: 0n,
      }],
    }) as readonly [bigint, bigint, number, bigint];
    const amountOutRaw = quoteResult[0];

    const amountOutUsd = request.side === "buy"
      ? Number(formatUnits(amountOutRaw, tokenOut.decimals)) * referencePriceUsd
      : Number(formatUnits(amountOutRaw, tokenOut.decimals));

    return {
      pair: request.pair,
      side: request.side,
      notionalUsd: Number(request.notionalUsd.toFixed(2)),
      amountIn: toAmountQuote(
        tokenIn.symbol,
        amountInRaw,
        tokenIn.decimals,
        request.notionalUsd,
      ),
      amountOut: toAmountQuote(
        tokenOut.symbol,
        amountOutRaw,
        tokenOut.decimals,
        amountOutUsd,
      ),
      minAmountOut: toAmountQuote(
        tokenOut.symbol,
        slippageFloor(amountOutRaw, config.risk.maxSlippageBps),
        tokenOut.decimals,
        amountOutUsd * ((10_000 - config.risk.maxSlippageBps) / 10_000),
      ),
      referencePriceUsd: Number(referencePriceUsd.toFixed(4)),
      slippageBps: config.risk.maxSlippageBps,
      executionPlan: {
        chainId: config.chain.id,
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        router: config.uniswap.swapRouter02,
        spender: config.uniswap.swapRouter02,
        quoter: config.uniswap.quoterV2,
        recipient: config.wallet.address,
        poolFee: config.uniswap.poolFee,
      },
    };
  }

  async execute(
    config: WorkerConfig,
    _request: TradeIntentRequest,
    quote: QuoteData,
  ): Promise<ExecutionResult> {
    assertAllowedExecutionPlan(config, quote);

    if (config.executionMode === "dry-run") {
      return {
        mode: "dry-run",
        status: "simulated",
        amountIn: quote.amountIn,
        amountOut: quote.amountOut,
      };
    }

    const { publicClient, account, walletClient } = this.createClients(config);
    if (!account || !walletClient) {
      throw new Error("Live mode requires BURNER_PRIVATE_KEY on the worker host.");
    }

    const tokenInConfig = config.tokens[quote.amountIn.symbol];
    const tokenOutConfig = config.tokens[quote.amountOut.symbol];
    const amountInRaw = BigInt(quote.amountIn.raw);
    const minAmountOutRaw = BigInt(quote.minAmountOut.raw);

    const preTokenIn = await this.getTokenBalance(config, quote.amountIn.symbol);
    const preTokenOut = await this.getTokenBalance(config, quote.amountOut.symbol);
    const preAllowance = await this.getAllowance(
      config,
      tokenInConfig.address,
      quote.executionPlan.spender,
    );

    let approvalHash: Hex | undefined;
    let swapHash: Hex | undefined;
    let revokeHash: Hex | undefined;

    try {
      if (preAllowance < amountInRaw) {
        const approvalSimulation = await publicClient.simulateContract({
          account,
          abi: erc20Abi,
          address: tokenInConfig.address,
          functionName: "approve",
          args: [quote.executionPlan.spender, amountInRaw],
        });
        approvalHash = await walletClient.writeContract(approvalSimulation.request);
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }

      const swapSimulation = await publicClient.simulateContract({
        account,
        abi: SWAP_ROUTER_ABI,
        address: quote.executionPlan.router,
        functionName: "exactInputSingle",
        args: [{
          tokenIn: tokenInConfig.address,
          tokenOut: tokenOutConfig.address,
          fee: quote.executionPlan.poolFee,
          recipient: account.address,
          amountIn: amountInRaw,
          amountOutMinimum: minAmountOutRaw,
          sqrtPriceLimitX96: 0n,
        }],
      });

      swapHash = await walletClient.writeContract(swapSimulation.request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });
      if (receipt.status !== "success") {
        throw new Error(`Swap receipt returned status ${receipt.status}.`);
      }

      const postTokenIn = await this.getTokenBalance(config, quote.amountIn.symbol);
      const postTokenOut = await this.getTokenBalance(config, quote.amountOut.symbol);
      const actualAmountIn = preTokenIn > postTokenIn ? preTokenIn - postTokenIn : amountInRaw;
      const actualAmountOut = postTokenOut > preTokenOut ? postTokenOut - preTokenOut : BigInt(quote.amountOut.raw);

      const remainingAllowance = await this.getAllowance(
        config,
        tokenInConfig.address,
        quote.executionPlan.spender,
      );
      if (remainingAllowance > 0n) {
        const revokeSimulation = await publicClient.simulateContract({
          account,
          abi: erc20Abi,
          address: tokenInConfig.address,
          functionName: "approve",
          args: [quote.executionPlan.spender, 0n],
        });
        revokeHash = await walletClient.writeContract(revokeSimulation.request);
        await publicClient.waitForTransactionReceipt({ hash: revokeHash });
      }

      return {
        mode: "live",
        status: "confirmed",
        transactionHash: swapHash,
        approvalHash,
        revokeHash,
        amountIn: toAmountQuote(
          quote.amountIn.symbol,
          actualAmountIn,
          tokenInConfig.decimals,
          quote.amountIn.usdValue,
        ),
        amountOut: toAmountQuote(
          quote.amountOut.symbol,
          actualAmountOut,
          tokenOutConfig.decimals,
          quote.amountOut.usdValue,
        ),
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber.toString(),
      };
    } catch (error) {
      try {
        const remainingAllowance = await this.getAllowance(
          config,
          tokenInConfig.address,
          quote.executionPlan.spender,
        );
        if (remainingAllowance > 0n) {
          const revokeSimulation = await publicClient.simulateContract({
            account,
            abi: erc20Abi,
            address: tokenInConfig.address,
            functionName: "approve",
            args: [quote.executionPlan.spender, 0n],
          });
          revokeHash = await walletClient.writeContract(revokeSimulation.request);
          await publicClient.waitForTransactionReceipt({ hash: revokeHash });
        }
      } catch {
        // Best-effort cleanup. The API response still exposes the failed status.
      }

      return {
        mode: "live",
        status: "failed",
        transactionHash: swapHash,
        approvalHash,
        revokeHash,
        amountIn: quote.amountIn,
        amountOut: quote.amountOut,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function createTradingService(env = process.env): TradingService {
  return new ViemTradingService(env);
}
