import { createUpbitToken } from "./auth.js";
import type { Exchange, Ticker, Orderbook, Candle, Balance, OrderRequest, OrderResponse } from "../types.js";

const BASE_URL = "https://api.upbit.com";

export class UpbitExchange implements Exchange {
  name = "upbit";

  constructor(
    private accessKey: string,
    private secretKey: string,
  ) {}

  private async fetchPublic(path: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, BASE_URL);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Upbit API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  private async fetchPrivate(method: string, path: string, params?: Record<string, string>, body?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, BASE_URL);
    let queryString: string | undefined;

    if (method === "GET" || method === "DELETE") {
      if (params) {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        queryString = url.searchParams.toString();
      }
    } else if (body) {
      queryString = new URLSearchParams(body).toString();
    }

    const token = createUpbitToken(this.accessKey, this.secretKey, queryString);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    const options: RequestInit = { method, headers };
    if (method === "POST" && body) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url.toString(), options);
    if (!res.ok) throw new Error(`Upbit API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async getPrice(symbol: string): Promise<Ticker> {
    const market = this.toMarket(symbol);
    const data = await this.fetchPublic("/v1/ticker", { markets: market }) as any[];
    const t = data[0];
    return {
      symbol,
      price: t.trade_price,
      change: t.signed_change_price,
      changeRate: t.signed_change_rate,
      volume24h: t.acc_trade_volume_24h,
      high24h: t.high_price,
      low24h: t.low_price,
      timestamp: t.timestamp,
    };
  }

  async getOrderbook(symbol: string): Promise<Orderbook> {
    const market = this.toMarket(symbol);
    const data = await this.fetchPublic("/v1/orderbook", { markets: market }) as any[];
    const ob = data[0];
    return {
      symbol,
      asks: ob.orderbook_units.map((u: any) => ({ price: u.ask_price, size: u.ask_size })),
      bids: ob.orderbook_units.map((u: any) => ({ price: u.bid_price, size: u.bid_size })),
      timestamp: ob.timestamp,
    };
  }

  async getCandles(symbol: string, interval: string, count = 50): Promise<Candle[]> {
    const market = this.toMarket(symbol);
    const unit = this.parseInterval(interval);
    const path = unit.type === "minutes" ? `/v1/candles/minutes/${unit.value}` : `/v1/candles/${unit.type}`;
    const data = await this.fetchPublic(path, { market, count: String(count) }) as any[];
    return data.map((c: any) => ({
      timestamp: c.timestamp,
      open: c.opening_price,
      high: c.high_price,
      low: c.low_price,
      close: c.trade_price,
      volume: c.candle_acc_trade_volume,
    }));
  }

  async getBalance(): Promise<Balance[]> {
    const data = await this.fetchPrivate("GET", "/v1/accounts") as any[];
    return data.map((a: any) => ({
      currency: a.currency,
      available: parseFloat(a.balance),
      locked: parseFloat(a.locked),
      avgBuyPrice: parseFloat(a.avg_buy_price),
    }));
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    const market = this.toMarket(order.symbol);
    const body: Record<string, string> = {
      market,
      side: order.side === "buy" ? "bid" : "ask",
    };

    if (order.type === "market") {
      if (order.side === "buy") {
        body.ord_type = "price";
        body.price = String(order.amount);
      } else {
        body.ord_type = "market";
        body.volume = String(order.amount);
      }
    } else {
      body.ord_type = "limit";
      body.price = String(order.price!);
      body.volume = String(order.amount);
    }

    const data = await this.fetchPrivate("POST", "/v1/orders", undefined, body) as any;
    return this.toOrderResponse(data);
  }

  async cancelOrder(orderId: string): Promise<OrderResponse> {
    const data = await this.fetchPrivate("DELETE", "/v1/order", { uuid: orderId }) as any;
    return this.toOrderResponse(data);
  }

  async getOrder(orderId: string): Promise<OrderResponse> {
    const data = await this.fetchPrivate("GET", "/v1/order", { uuid: orderId }) as any;
    return this.toOrderResponse(data);
  }

  async getOpenOrders(symbol?: string): Promise<OrderResponse[]> {
    const params: Record<string, string> = {};
    if (symbol) params.market = this.toMarket(symbol);
    const data = await this.fetchPrivate("GET", "/v1/orders/open", params) as any[];
    return data.map((d: any) => this.toOrderResponse(d));
  }

  // Convert to Upbit market format (quote-base, e.g. KRW-BTC)
  // Priority: KRW > USDT > BTC (higher-priority quote always comes first)
  private toMarket(symbol: string): string {
    const parts = symbol.split("-");
    if (parts.length !== 2) return symbol;
    const QUOTE_PRIORITY: Record<string, number> = { KRW: 3, USDT: 2, BTC: 1 };
    const p0 = QUOTE_PRIORITY[parts[0]] ?? 0;
    const p1 = QUOTE_PRIORITY[parts[1]] ?? 0;
    if (p0 >= p1) return symbol;
    return `${parts[1]}-${parts[0]}`;
  }

  private toOrderResponse(data: any): OrderResponse {
    const filledAmount = parseFloat(data.executed_volume ?? "0");
    const filledPrice = this.calcFilledPrice(data.trades);
    return {
      id: data.uuid,
      symbol: data.market,
      side: data.side === "bid" ? "buy" : "sell",
      type: data.ord_type === "limit" ? "limit" : "market",
      status: this.mapStatus(data.state, data.ord_type, filledAmount),
      amount: parseFloat(data.volume ?? data.price ?? "0"),
      price: data.price ? parseFloat(data.price) : null,
      filledAmount,
      filledPrice,
      createdAt: data.created_at,
    };
  }

  // Upbit market buy (ord_type "price") always ends with state "cancel"
  // even when fully filled. Treat as "filled" if executed_volume > 0.
  private mapStatus(state: string, ordType?: string, filledAmount?: number): OrderResponse["status"] {
    if (state === "cancel" && (ordType === "price" || ordType === "market") && filledAmount && filledAmount > 0) {
      return "filled";
    }
    switch (state) {
      case "wait": case "watch": return "pending";
      case "done": return "filled";
      case "cancel": return "cancelled";
      default: return "pending";
    }
  }

  // Calculate volume-weighted average price from trades array
  private calcFilledPrice(trades?: any[]): number | null {
    if (!trades || trades.length === 0) return null;
    let totalFunds = 0;
    let totalVolume = 0;
    for (const t of trades) {
      totalFunds += parseFloat(t.funds);
      totalVolume += parseFloat(t.volume);
    }
    return totalVolume > 0 ? totalFunds / totalVolume : null;
  }

  private parseInterval(interval: string): { type: string; value: number } {
    const match = interval.match(/^(\d+)(m|h|d|w|M)$/);
    if (!match) return { type: "minutes", value: 60 };
    const [, num, unit] = match;
    switch (unit) {
      case "m": return { type: "minutes", value: parseInt(num) };
      case "h": return { type: "minutes", value: parseInt(num) * 60 };
      case "d": return { type: "days", value: parseInt(num) };
      case "w": return { type: "weeks", value: parseInt(num) };
      case "M": return { type: "months", value: parseInt(num) };
      default: return { type: "minutes", value: 60 };
    }
  }
}
