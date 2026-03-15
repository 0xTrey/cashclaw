import { describe, expect, it } from "vitest";
import { createTradingService } from "../src/crypto/service.js";
import { createConfig, createQuote, createTradeIntent } from "./fixtures.js";

describe("trading service guardrails", () => {
  it("rejects execution plans that mutate the pinned router", async () => {
    const config = createConfig();
    const quote = createQuote();
    quote.executionPlan.router = "0x2222222222222222222222222222222222222222";

    const service = createTradingService();

    await expect(service.execute(config, createTradeIntent(), quote)).rejects.toThrow("not allowlisted");
  });
});
