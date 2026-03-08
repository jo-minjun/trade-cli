import type { Exchange, Ticker, Orderbook, Candle, Balance, OrderRequest, OrderResponse } from "../types.js";

const CLOB_BASE = "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma-api.polymarket.com";

export interface PredictionMarket {
  id: string;
  question: string;
  description: string;
  outcomes: string[];
  volume: number;
  liquidity: number;
  endDate: string;
}

export interface PredictionMarketDetail extends PredictionMarket {
  tokens: { outcome: string; tokenId: string; price: number }[];
}

export interface PredictionPosition {
  marketId: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
}

export class PolymarketExchange implements Exchange {
  name = "polymarket";

  constructor(private privateKey: string) {}

  private async fetchPublic(baseUrl: string, path: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Polymarket API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async searchMarkets(query: string): Promise<PredictionMarket[]> {
    const data = await this.fetchPublic(GAMMA_BASE, "/markets", { closed: "false", ...(query ? { slug_like: query } : {}) }) as any[];
    return (data || []).map((m: any) => ({
      id: m.conditionId || m.id,
      question: m.question || "",
      description: m.description || "",
      outcomes: (m.outcomes || "Yes,No").split(","),
      volume: parseFloat(m.volume || "0"),
      liquidity: parseFloat(m.liquidity || "0"),
      endDate: m.endDateIso || "",
    }));
  }

  async getMarket(marketId: string): Promise<PredictionMarketDetail> {
    const data = await this.fetchPublic(GAMMA_BASE, `/markets/${marketId}`) as any;
    const tokens = (data.tokens || []).map((t: any) => ({
      outcome: t.outcome,
      tokenId: t.token_id,
      price: parseFloat(t.price || "0"),
    }));
    return {
      id: data.conditionId || data.id,
      question: data.question || "",
      description: data.description || "",
      outcomes: (data.outcomes || "Yes,No").split(","),
      volume: parseFloat(data.volume || "0"),
      liquidity: parseFloat(data.liquidity || "0"),
      endDate: data.endDateIso || "",
      tokens,
    };
  }

  async getPrice(symbol: string): Promise<Ticker> {
    const market = await this.getMarket(symbol);
    const yesToken = market.tokens.find(t => t.outcome === "Yes");
    return {
      symbol,
      price: yesToken?.price ?? 0,
      change: 0,
      changeRate: 0,
      volume24h: market.volume,
      high24h: 1,
      low24h: 0,
      timestamp: Date.now(),
    };
  }

  async getOrderbook(symbol: string): Promise<Orderbook> {
    const data = await this.fetchPublic(CLOB_BASE, `/book`, { token_id: symbol }) as any;
    return {
      symbol,
      asks: (data.asks || []).map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) })),
      bids: (data.bids || []).map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
      timestamp: Date.now(),
    };
  }

  async getCandles(_symbol: string, _interval: string, _count?: number): Promise<Candle[]> {
    return [];
  }

  async getBalance(): Promise<Balance[]> {
    return [];
  }

  async placeOrder(_order: OrderRequest): Promise<OrderResponse> {
    throw new Error("Polymarket order placement requires wallet signing setup. Use the Polymarket web UI for now.");
  }

  async cancelOrder(_orderId: string): Promise<OrderResponse> {
    throw new Error("Polymarket order cancellation requires wallet signing setup.");
  }

  async getOrder(orderId: string): Promise<OrderResponse> {
    const data = await this.fetchPublic(CLOB_BASE, `/order/${orderId}`) as any;
    return {
      id: data.id || orderId,
      symbol: data.asset_id || "",
      side: data.side === "BUY" ? "buy" : "sell",
      type: "limit",
      status: data.status === "MATCHED" ? "filled" : "pending",
      amount: parseFloat(data.original_size || "0"),
      price: parseFloat(data.price || "0"),
      filledAmount: parseFloat(data.size_matched || "0"),
      filledPrice: parseFloat(data.price || "0"),
      createdAt: data.created_at || new Date().toISOString(),
    };
  }

  async getOpenOrders(_symbol?: string): Promise<OrderResponse[]> {
    return [];
  }

  async getPositions(): Promise<PredictionPosition[]> {
    return [];
  }
}
