import { describe, it, expect, vi, beforeEach } from "vitest";
import { KisExchange } from "./client.js";

describe("KisExchange", () => {
  let exchange: KisExchange;

  beforeEach(() => {
    exchange = new KisExchange("test-key", "test-secret", "12345678-01", true);
  });

  it("getPrice returns Ticker (mocked)", async () => {
    const mockResponse = {
      output: {
        stck_prpr: "70000",
        prdy_vrss: "500",
        prdy_ctrt: "0.72",
        acml_vol: "15000000",
        stck_hgpr: "71000",
        stck_lwpr: "69500",
      },
    };

    vi.spyOn(exchange as any, "fetchApi").mockResolvedValue(mockResponse);

    const ticker = await exchange.getPrice("005930");
    expect(ticker.symbol).toBe("005930");
    expect(ticker.price).toBe(70000);
    expect(ticker.change).toBe(500);
  });

  it("placeOrder returns order response (mocked)", async () => {
    vi.spyOn(exchange as any, "fetchApi").mockResolvedValue({
      output: { ODNO: "12345" },
    });
    vi.spyOn((exchange as any).auth, "getAccessToken").mockResolvedValue("mock-token");
    vi.spyOn((exchange as any).auth, "getHashkey").mockResolvedValue("mock-hash");

    const order = await exchange.placeOrder({
      symbol: "005930", side: "buy", type: "market", amount: 10,
    });
    expect(order.id).toBe("12345");
    expect(order.side).toBe("buy");
  });

  it("uses correct trade IDs", () => {
    // Mock trading uses VTTC prefixes
    expect((exchange as any).auth.getTradeId("buy")).toBe("VTTC0802U");
    expect((exchange as any).auth.getTradeId("sell")).toBe("VTTC0801U");
  });
});
