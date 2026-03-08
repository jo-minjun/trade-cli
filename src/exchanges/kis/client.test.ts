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

  it("getOrder returns order status (mocked)", async () => {
    const mockResponse = {
      output1: [
        {
          odno: "00001",
          pdno: "005930",
          sll_buy_dvsn_cd: "02",
          ord_dvsn_cd: "01",
          ord_qty: "10",
          ord_unpr: "0",
          tot_ccld_qty: "10",
          avg_prvs: "70000",
          ord_dt: "20260308",
          ord_tmd: "100000",
        },
        {
          odno: "00002",
          pdno: "005930",
          sll_buy_dvsn_cd: "01",
          ord_dvsn_cd: "00",
          ord_qty: "5",
          ord_unpr: "71000",
          tot_ccld_qty: "0",
          avg_prvs: "0",
          ord_dt: "20260308",
          ord_tmd: "100100",
        },
      ],
    };

    vi.spyOn(exchange as any, "fetchApi").mockResolvedValue(mockResponse);

    const order = await exchange.getOrder("00001");
    expect(order.id).toBe("00001");
    expect(order.symbol).toBe("005930");
    expect(order.side).toBe("buy");
    expect(order.type).toBe("market");
    expect(order.status).toBe("filled");
    expect(order.filledAmount).toBe(10);
    expect(order.filledPrice).toBe(70000);
  });

  it("getOpenOrders returns unfilled orders (mocked)", async () => {
    const mockResponse = {
      output1: [
        {
          odno: "00001", pdno: "005930", sll_buy_dvsn_cd: "02",
          ord_dvsn_cd: "01", ord_qty: "10", ord_unpr: "0",
          tot_ccld_qty: "10", avg_prvs: "70000",
          ord_dt: "20260308", ord_tmd: "100000",
        },
        {
          odno: "00002", pdno: "005930", sll_buy_dvsn_cd: "01",
          ord_dvsn_cd: "00", ord_qty: "5", ord_unpr: "71000",
          tot_ccld_qty: "0", avg_prvs: "0",
          ord_dt: "20260308", ord_tmd: "100100",
        },
      ],
    };

    vi.spyOn(exchange as any, "fetchApi").mockResolvedValue(mockResponse);

    const orders = await exchange.getOpenOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe("00002");
    expect(orders[0].status).toBe("pending");
  });

  it("getOpenOrders filters by symbol (mocked)", async () => {
    const mockResponse = {
      output1: [
        {
          odno: "00001", pdno: "005930", sll_buy_dvsn_cd: "02",
          ord_dvsn_cd: "00", ord_qty: "10", ord_unpr: "70000",
          tot_ccld_qty: "0", avg_prvs: "0",
          ord_dt: "20260308", ord_tmd: "100000",
        },
        {
          odno: "00002", pdno: "000660", sll_buy_dvsn_cd: "02",
          ord_dvsn_cd: "00", ord_qty: "5", ord_unpr: "50000",
          tot_ccld_qty: "0", avg_prvs: "0",
          ord_dt: "20260308", ord_tmd: "100100",
        },
      ],
    };

    vi.spyOn(exchange as any, "fetchApi").mockResolvedValue(mockResponse);

    const orders = await exchange.getOpenOrders("005930");
    expect(orders).toHaveLength(1);
    expect(orders[0].symbol).toBe("005930");
  });

  it("uses correct trade IDs", () => {
    // Mock trading uses VTTC prefixes
    expect((exchange as any).auth.getTradeId("buy")).toBe("VTTC0802U");
    expect((exchange as any).auth.getTradeId("sell")).toBe("VTTC0801U");
  });
});
