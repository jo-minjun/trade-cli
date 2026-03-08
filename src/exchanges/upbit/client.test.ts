import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpbitExchange } from "./client.js";

describe("UpbitExchange", () => {
  let exchange: UpbitExchange;

  beforeEach(() => {
    exchange = new UpbitExchange("test-key", "test-secret");
  });

  it("getPrice returns Ticker (mocked)", async () => {
    const mockResponse = [{
      market: "KRW-BTC",
      trade_price: 133000000,
      signed_change_price: 1500000,
      signed_change_rate: 0.0114,
      acc_trade_volume_24h: 1700,
      high_price: 135000000,
      low_price: 131000000,
      timestamp: Date.now(),
    }];

    vi.spyOn(exchange as any, "fetchPublic").mockResolvedValue(mockResponse);

    const ticker = await exchange.getPrice("BTC-KRW");
    expect(ticker.symbol).toBe("BTC-KRW");
    expect(ticker.price).toBe(133000000);
  });

  it("placeOrder returns order response (mocked)", async () => {
    const mockResponse = {
      uuid: "test-uuid-123",
      side: "bid",
      ord_type: "price",
      price: "100000",
      state: "wait",
      market: "KRW-BTC",
      volume: null,
      remaining_volume: null,
      executed_volume: "0.0",
      created_at: "2026-03-08T15:00:00+09:00",
    };

    vi.spyOn(exchange as any, "fetchPrivate").mockResolvedValue(mockResponse);

    const order = await exchange.placeOrder({
      symbol: "BTC-KRW", side: "buy", type: "market", amount: 100000,
    });
    expect(order.id).toBe("test-uuid-123");
    expect(order.side).toBe("buy");
  });
});
