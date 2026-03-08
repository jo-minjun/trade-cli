import { describe, it, expect, vi, beforeEach } from "vitest";

const mockClient = {
  getOpenOrders: vi.fn(),
  getOrder: vi.fn(),
  createAndPostOrder: vi.fn(),
  cancelOrder: vi.fn(),
  getBalanceAllowance: vi.fn(),
  getOrderBook: vi.fn(),
};

vi.mock("@polymarket/clob-client", () => ({
  ClobClient: vi.fn(function (this: any) { Object.assign(this, mockClient); }),
  Side: { BUY: "BUY", SELL: "SELL" },
  OrderType: { GTC: "GTC", FOK: "FOK" },
  AssetType: { COLLATERAL: "COLLATERAL", CONDITIONAL: "CONDITIONAL" },
}));

vi.mock("ethers", () => ({
  Wallet: vi.fn(function (this: any) { this.address = "0xTestAddress"; }),
}));

import { PolymarketExchange } from "./client.js";

describe("PolymarketExchange", () => {
  let exchange: PolymarketExchange;

  beforeEach(() => {
    vi.clearAllMocks();
    exchange = new PolymarketExchange({ "private-key": "0xtest-private-key" });
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

    vi.spyOn(exchange as any, "fetchGamma").mockResolvedValue(mockResponse);

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

  it("getOrderbook returns order book via SDK", async () => {
    mockClient.getOrderBook.mockResolvedValue({
      asks: [{ price: "0.70", size: "100" }],
      bids: [{ price: "0.60", size: "200" }],
    });

    const ob = await exchange.getOrderbook("token-yes");
    expect(ob.asks).toHaveLength(1);
    expect(ob.bids).toHaveLength(1);
    expect(ob.asks[0].price).toBe(0.7);
    expect(ob.bids[0].size).toBe(200);
  });

  it("getBalance returns USDC balance", async () => {
    mockClient.getBalanceAllowance.mockResolvedValue({
      balance: "1234.56",
      allowance: "999999",
    });

    const balances = await exchange.getBalance();
    expect(balances).toHaveLength(1);
    expect(balances[0].currency).toBe("USDC");
    expect(balances[0].available).toBe(1234.56);
    expect(balances[0].locked).toBe(0);
  });

  it("placeOrder creates order via SDK", async () => {
    vi.spyOn(exchange, "getMarket").mockResolvedValue({
      id: "0x123",
      question: "Test?",
      description: "",
      outcomes: ["Yes", "No"],
      volume: 0,
      liquidity: 0,
      endDate: "",
      tokens: [
        { outcome: "Yes", tokenId: "token-yes-id", price: 0.65 },
        { outcome: "No", tokenId: "token-no-id", price: 0.35 },
      ],
    });

    mockClient.createAndPostOrder.mockResolvedValue({
      success: true,
      orderID: "order-123",
    });

    const result = await exchange.placeOrder({
      symbol: "0x123:Yes",
      side: "buy",
      type: "limit",
      amount: 100,
      price: 0.65,
    });

    expect(result.id).toBe("order-123");
    expect(result.status).toBe("pending");
    expect(result.side).toBe("buy");
    expect(mockClient.createAndPostOrder).toHaveBeenCalledWith(
      { tokenID: "token-yes-id", price: 0.65, size: 100, side: "BUY" },
      { tickSize: "0.01" },
      "GTC",
    );
  });

  it("placeOrder throws on invalid symbol format", async () => {
    await expect(exchange.placeOrder({
      symbol: "no-colon",
      side: "buy",
      type: "limit",
      amount: 100,
      price: 0.5,
    })).rejects.toThrow("marketId:outcome");
  });

  it("placeOrder throws when outcome not found", async () => {
    vi.spyOn(exchange, "getMarket").mockResolvedValue({
      id: "0x123",
      question: "Test?",
      description: "",
      outcomes: ["Yes", "No"],
      volume: 0,
      liquidity: 0,
      endDate: "",
      tokens: [
        { outcome: "Yes", tokenId: "token-yes", price: 0.65 },
      ],
    });

    await expect(exchange.placeOrder({
      symbol: "0x123:Maybe",
      side: "buy",
      type: "limit",
      amount: 100,
      price: 0.5,
    })).rejects.toThrow('Outcome "Maybe" not found');
  });

  it("placeOrder throws when price is missing", async () => {
    await expect(exchange.placeOrder({
      symbol: "0x123:Yes",
      side: "buy",
      type: "limit",
      amount: 100,
    })).rejects.toThrow("Price is required");
  });

  it("placeOrder throws on SDK failure", async () => {
    vi.spyOn(exchange, "getMarket").mockResolvedValue({
      id: "0x123",
      question: "Test?",
      description: "",
      outcomes: ["Yes", "No"],
      volume: 0,
      liquidity: 0,
      endDate: "",
      tokens: [{ outcome: "Yes", tokenId: "token-yes", price: 0.5 }],
    });

    mockClient.createAndPostOrder.mockResolvedValue({
      success: false,
      errorMsg: "Insufficient balance",
    });

    await expect(exchange.placeOrder({
      symbol: "0x123:Yes",
      side: "buy",
      type: "limit",
      amount: 100,
      price: 0.5,
    })).rejects.toThrow("Insufficient balance");
  });

  it("cancelOrder calls SDK and returns cancelled response", async () => {
    mockClient.cancelOrder.mockResolvedValue({});

    const result = await exchange.cancelOrder("order-abc");
    expect(result.id).toBe("order-abc");
    expect(result.status).toBe("cancelled");
    expect(mockClient.cancelOrder).toHaveBeenCalledWith({ orderID: "order-abc" });
  });

  it("getOrder maps SDK response correctly", async () => {
    mockClient.getOrder.mockResolvedValue({
      id: "order-xyz",
      asset_id: "token-123",
      side: "BUY",
      status: "MATCHED",
      original_size: "50",
      size_matched: "50",
      price: "0.70",
      created_at: 1700000000000,
    });

    const result = await exchange.getOrder("order-xyz");
    expect(result.id).toBe("order-xyz");
    expect(result.side).toBe("buy");
    expect(result.status).toBe("filled");
    expect(result.amount).toBe(50);
    expect(result.filledAmount).toBe(50);
    expect(result.price).toBe(0.7);
  });

  it("getOpenOrders maps SDK response correctly", async () => {
    mockClient.getOpenOrders.mockResolvedValue([
      {
        id: "open-1",
        asset_id: "token-a",
        side: "SELL",
        status: "LIVE",
        original_size: "25",
        size_matched: "10",
        price: "0.80",
        created_at: 1700000000000,
      },
    ]);

    const orders = await exchange.getOpenOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe("open-1");
    expect(orders[0].side).toBe("sell");
    expect(orders[0].status).toBe("pending");
    expect(orders[0].amount).toBe(25);
  });

  it("getPositions returns empty array", async () => {
    const positions = await exchange.getPositions();
    expect(positions).toEqual([]);
  });

  it("getCandles throws not supported error", async () => {
    await expect(exchange.getCandles("any", "1h")).rejects.toThrow("Not supported");
  });
});
