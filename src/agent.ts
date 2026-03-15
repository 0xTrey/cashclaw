import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ensureConfig, updatePausedState } from "./config.js";
import { isAuthorized } from "./crypto/auth.js";
import { APP_NAME, APP_VERSION } from "./crypto/constants.js";
import { appendLedgerEntry, loadLedger, summarizeLedger } from "./crypto/ledger.js";
import { buildPolicySnapshot, validateQuoteRequest, validateTradeIntent } from "./crypto/policy.js";
import { createTradingService } from "./crypto/service.js";
import type {
  HealthResponse,
  QuoteRequest,
  TradeIntentRequest,
  TradingService,
  WorkerConfig,
  WorkerResponse,
} from "./crypto/types.js";

const MAX_BODY_BYTES = 256 * 1024;

interface StartOptions {
  config?: WorkerConfig;
  env?: NodeJS.ProcessEnv;
  host?: string;
  port?: number;
  service?: TradingService;
  now?: () => number;
}

interface ServerContext {
  config: WorkerConfig;
  env: NodeJS.ProcessEnv;
  startedAt: number;
  service: TradingService;
  now: () => number;
}

export async function startAgent(options: StartOptions = {}): Promise<http.Server> {
  const env = options.env ?? process.env;
  const config = options.config ?? ensureConfig(env);
  const ctx: ServerContext = {
    config,
    env,
    startedAt: Date.now(),
    service: options.service ?? createTradingService(env),
    now: options.now ?? Date.now,
  };

  const server = createServer(ctx);
  const host = options.host ?? config.server.host;
  const port = options.port ?? config.server.port;

  await new Promise<void>((resolve) => {
    server.listen(port, host, resolve);
  });

  const address = server.address();
  if (typeof address === "object" && address) {
    console.log(`${APP_NAME} listening on http://${address.address}:${address.port}`);
  }

  return server;
}

function createServer(ctx: ServerContext): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://worker.local");

    if (url.pathname.startsWith("/api/")) {
      void handleApi(url, req, res, ctx);
      return;
    }

    serveStatic(url.pathname, res);
  });
}

function json(res: http.ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    let body = "";
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      body += chunk.toString("utf8");
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseJsonBody<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

async function handleApi(
  url: URL,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: ServerContext,
): Promise<void> {
  if (!isAuthorized(req, ctx.config)) {
    json(res, { error: "Unauthorized." }, 401);
    return;
  }

  const ledgerEntries = loadLedger(undefined, ctx.env);
  const summary = summarizeLedger(ledgerEntries, ctx.now());
  const policySnapshot = buildPolicySnapshot(ctx.config, summary);

  try {
    switch (`${req.method} ${url.pathname}`) {
      case "GET /api/health": {
        const health: HealthResponse = {
          appName: APP_NAME,
          version: APP_VERSION,
          chainId: ctx.config.chain.id,
          chainName: ctx.config.chain.name,
          executionMode: ctx.config.executionMode,
          paused: ctx.config.paused,
          walletAddress: ctx.config.wallet.address,
          startedAt: ctx.startedAt,
        };
        json(res, health);
        return;
      }

      case "GET /api/policy":
        json(res, { policySnapshot, allowlists: {
          tokens: Object.values(ctx.config.tokens).map((token) => token.address),
          routers: ctx.config.uniswap.routerAllowlist,
          spenders: ctx.config.uniswap.spenderAllowlist,
        } });
        return;

      case "GET /api/portfolio": {
        const portfolio = await ctx.service.getPortfolio(ctx.config);
        json(res, { portfolio, policySnapshot });
        return;
      }

      case "GET /api/history": {
        const limit = Number.parseInt(url.searchParams.get("limit") ?? `${ctx.config.historyLimit}`, 10);
        json(res, {
          entries: loadLedger(Number.isFinite(limit) ? limit : ctx.config.historyLimit, ctx.env),
          policySnapshot,
        });
        return;
      }

      case "POST /api/quote": {
        const body = parseJsonBody<QuoteRequest>(await readBody(req));
        const validationError = validateQuoteRequest(ctx.config, body);
        if (validationError) {
          appendLedgerEntry({
            timestamp: ctx.now(),
            type: "quote_rejected",
            request: body,
            reason: validationError,
            policySnapshot,
          }, ctx.env);
          const response: WorkerResponse = {
            accepted: false,
            reason: validationError,
            policySnapshot,
          };
          json(res, response, 400);
          return;
        }

        const quote = await ctx.service.quote(ctx.config, body);
        appendLedgerEntry({
          timestamp: ctx.now(),
          type: "quote",
          request: body,
          quote,
          policySnapshot,
        }, ctx.env);
        const response: WorkerResponse = {
          accepted: true,
          quote,
          policySnapshot,
        };
        json(res, response);
        return;
      }

      case "POST /api/trade-intents": {
        const body = parseJsonBody<TradeIntentRequest>(await readBody(req));
        const portfolioBefore = await ctx.service.getPortfolio(ctx.config);
        const validationError = validateTradeIntent(ctx.config, body, summary, portfolioBefore);
        if (validationError) {
          appendLedgerEntry({
            timestamp: ctx.now(),
            type: "trade_rejected",
            request: body,
            reason: validationError,
            portfolio: portfolioBefore,
            policySnapshot,
          }, ctx.env);
          const response: WorkerResponse = {
            accepted: false,
            reason: validationError,
            policySnapshot,
          };
          json(res, response, 400);
          return;
        }

        const quote = await ctx.service.quote(ctx.config, body);
        appendLedgerEntry({
          timestamp: ctx.now(),
          type: "portfolio_snapshot",
          request: body,
          portfolio: portfolioBefore,
          policySnapshot,
        }, ctx.env);

        const execution = await ctx.service.execute(ctx.config, body, quote);
        let portfolioAfter = portfolioBefore;
        let postTradeRefreshError: string | undefined;

        if (execution.mode !== "dry-run") {
          try {
            portfolioAfter = await ctx.service.getPortfolio(ctx.config);
          } catch (error) {
            postTradeRefreshError = error instanceof Error ? error.message : String(error);
          }
        }

        const pnlDeltaUsd = execution.mode === "dry-run" || postTradeRefreshError
          ? 0
          : Number((portfolioAfter.totalUsd - portfolioBefore.totalUsd).toFixed(4));

        appendLedgerEntry({
          timestamp: ctx.now(),
          type: execution.status === "confirmed"
            ? "trade_executed"
            : execution.mode === "dry-run"
              ? "trade_simulated"
              : "policy_violation",
          request: body,
          quote,
          execution,
          portfolio: portfolioAfter,
          pnlDeltaUsd,
          policySnapshot,
          reason: execution.status === "failed"
            ? execution.error
            : postTradeRefreshError
              ? `Post-trade portfolio refresh failed: ${postTradeRefreshError}`
              : undefined,
        }, ctx.env);

        appendLedgerEntry({
          timestamp: ctx.now(),
          type: "portfolio_snapshot",
          request: body,
          portfolio: portfolioAfter,
          reason: postTradeRefreshError
            ? `Post-trade portfolio refresh failed: ${postTradeRefreshError}`
            : undefined,
          policySnapshot,
          pnlDeltaUsd,
        }, ctx.env);

        const accepted = execution.status === "confirmed" || execution.status === "simulated";
        const response: WorkerResponse = {
          accepted,
          reason: accepted ? undefined : execution.error ?? "Execution failed.",
          quote,
          execution,
          policySnapshot: buildPolicySnapshot(
            ctx.config,
            summarizeLedger(loadLedger(undefined, ctx.env), ctx.now()),
          ),
        };
        json(res, response, accepted ? 200 : 500);
        return;
      }

      case "POST /api/pause": {
        ctx.config = updatePausedState(true, ctx.env);
        const nextSnapshot = buildPolicySnapshot(
          ctx.config,
          summarizeLedger(loadLedger(undefined, ctx.env), ctx.now()),
        );
        appendLedgerEntry({
          timestamp: ctx.now(),
          type: "pause",
          reason: "Operator paused worker.",
          policySnapshot: nextSnapshot,
        }, ctx.env);
        json(res, { accepted: true, policySnapshot: nextSnapshot });
        return;
      }

      case "POST /api/resume": {
        ctx.config = updatePausedState(false, ctx.env);
        const nextSnapshot = buildPolicySnapshot(
          ctx.config,
          summarizeLedger(loadLedger(undefined, ctx.env), ctx.now()),
        );
        appendLedgerEntry({
          timestamp: ctx.now(),
          type: "resume",
          reason: "Operator resumed worker.",
          policySnapshot: nextSnapshot,
        }, ctx.env);
        json(res, { accepted: true, policySnapshot: nextSnapshot });
        return;
      }

      default:
        json(res, { error: "Not found." }, 404);
    }
  } catch (error) {
    json(res, { error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

function serveStatic(pathname: string, res: http.ServerResponse): void {
  const baseDir = import.meta.dirname;
  const builtUiDir = path.resolve(baseDir, "..", "dist", "ui");
  const sourceUiDir = path.resolve(baseDir, "ui");
  const uiDir = fs.existsSync(path.join(builtUiDir, "index.html")) ? builtUiDir : sourceUiDir;
  const targetPath = pathname === "/"
    ? path.join(uiDir, "index.html")
    : path.resolve(uiDir, pathname.slice(1));

  if (!targetPath.startsWith(uiDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const filePath = path.extname(targetPath)
    ? targetPath
    : path.join(uiDir, "index.html");

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
  };

  res.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath)] ?? "text/plain",
  });
  fs.createReadStream(filePath).pipe(res);
}
