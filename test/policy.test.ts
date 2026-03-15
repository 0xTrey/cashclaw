import { describe, expect, it } from "vitest";
import { buildPolicySnapshot, validateQuoteRequest, validateTradeIntent } from "../src/crypto/policy.js";
import { createConfig, createPortfolio, createTradeIntent } from "./fixtures.js";

describe("worker policy", () => {
  it("rejects quotes that exceed the hard single-trade cap", () => {
    const config = createConfig();
    const reason = validateQuoteRequest(config, {
      pair: "USDC/WETH",
      side: "buy",
      notionalUsd: 5.01,
    });

    expect(reason).toContain("hard cap");
  });

  it("rejects trade intents while the worker is paused", () => {
    const config = createConfig();
    const reason = validateTradeIntent(
      config,
      createTradeIntent(),
      {
        tradeCount24h: 0,
        dailyNotionalUsd: 0,
        pnlUsd24h: 0,
        rejectionCount24h: 0,
        lastExecutionAt: null,
      },
      createPortfolio(),
    );

    expect(reason).toContain("paused");
  });

  it("rejects trade intents that would push WETH exposure over the hard limit", () => {
    const config = createConfig();
    config.paused = false;
    const portfolio = createPortfolio();
    portfolio.balances.WETH.usdValue = 26;
    portfolio.totalUsd = 50;
    portfolio.wethExposurePct = 52;

    const reason = validateTradeIntent(
      config,
      createTradeIntent(),
      {
        tradeCount24h: 0,
        dailyNotionalUsd: 0,
        pnlUsd24h: 0,
        rejectionCount24h: 0,
        lastExecutionAt: null,
      },
      portfolio,
    );

    expect(reason).toContain("Projected WETH exposure");
  });

  it("captures the active rolling limits in the policy snapshot", () => {
    const config = createConfig();
    const snapshot = buildPolicySnapshot(config, {
      tradeCount24h: 2,
      dailyNotionalUsd: 10,
      pnlUsd24h: -1.25,
      rejectionCount24h: 1,
      lastExecutionAt: 123,
    });

    expect(snapshot.allowedPairs).toEqual(["USDC/WETH"]);
    expect(snapshot.risk.maxDailyNotionalUsd).toBe(15);
    expect(snapshot.rolling24h.tradeCount24h).toBe(2);
  });
});
