import { describe, it, expect, vi, beforeEach } from "vitest";
import { PolymarketExchange } from "./client.js";

describe("PolymarketExchange", () => {
  let exchange: PolymarketExchange;

  beforeEach(() => {
    exchange = new PolymarketExchange("0xtest-private-key");
  });

  it("searchMarkets returns markets (mocked)", async () => {
    const mockResponse = [{
      conditionId: "0x123",
      question: "Will BTC hit 200k?",
      description: "Bitcoin price prediction",
      outcomes: "Yes,No",
      volume: "1000000",
      liquidity: "500000",
      endDateIso: "2026-12-31",
    }];

    vi.spyOn(exchange as any, "fetchPublic").mockResolvedValue(mockResponse);

    const markets = await exchange.searchMarkets("btc");
    expect(markets).toHaveLength(1);
    expect(markets[0].question).toBe("Will BTC hit 200k?");
    expect(markets[0].outcomes).toEqual(["Yes", "No"]);
  });

  it("getPrice returns YES token price (mocked)", async () => {
    vi.spyOn(exchange, "getMarket").mockResolvedValue({
      id: "0x123",
      question: "Will BTC hit 200k?",
      description: "",
      outcomes: ["Yes", "No"],
      volume: 1000000,
      liquidity: 500000,
      endDate: "2026-12-31",
      tokens: [
        { outcome: "Yes", tokenId: "token-yes", price: 0.65 },
        { outcome: "No", tokenId: "token-no", price: 0.35 },
      ],
    });

    const ticker = await exchange.getPrice("0x123");
    expect(ticker.price).toBe(0.65);
  });

  it("getOrderbook returns order book (mocked)", async () => {
    vi.spyOn(exchange as any, "fetchPublic").mockResolvedValue({
      asks: [{ price: "0.70", size: "100" }],
      bids: [{ price: "0.60", size: "200" }],
    });

    const ob = await exchange.getOrderbook("token-yes");
    expect(ob.asks).toHaveLength(1);
    expect(ob.bids).toHaveLength(1);
    expect(ob.asks[0].price).toBe(0.7);
  });

  it("placeOrder throws not implemented error", async () => {
    await expect(exchange.placeOrder({
      symbol: "token-yes", side: "buy", type: "limit", amount: 100, price: 0.65,
    })).rejects.toThrow("wallet signing");
  });
});
