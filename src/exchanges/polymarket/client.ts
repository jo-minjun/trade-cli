import { ClobClient, Side, OrderType, AssetType } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import type {
  Ticker, Orderbook, Candle, Balance,
  OrderRequest, OrderResponse,
  PredictionMarket, PredictionMarketDetail, PredictionPosition,
  PredictionExchange,
} from "../types.js";
import type { PolymarketCredentials } from "../../config/types.js";

const CLOB_HOST = "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma-api.polymarket.com";
const POLYGON_CHAIN_ID = 137;

export class PolymarketExchange implements PredictionExchange {
  name = "polymarket";
  private client: ClobClient | null;

  constructor(creds?: Partial<PolymarketCredentials>) {
    if (creds?.["private-key"]) {
      const wallet = new Wallet(creds["private-key"]);
      const apiCreds = creds["api-key"]
        ? { key: creds["api-key"], secret: creds["api-secret"] ?? "", passphrase: creds["api-passphrase"] ?? "" }
        : undefined;
      this.client = new ClobClient(
        CLOB_HOST,
        POLYGON_CHAIN_ID,
        wallet,
        apiCreds,
        undefined, // signatureType
        creds["funder-address"],
      );
    } else {
      this.client = null; // Read-only mode
    }
  }

  private requireClient(): ClobClient {
    if (!this.client) {
      throw new Error("Private key required. Run: trade config set prediction.polymarket.private-key 0x...");
    }
    return this.client;
  }

  private async fetchGamma(path: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, GAMMA_BASE);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Polymarket Gamma API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async searchMarkets(query: string): Promise<PredictionMarket[]> {
    const data = await this.fetchGamma("/markets", { closed: "false", ...(query ? { slug_like: query } : {}) }) as any[];
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
    // Use CLOB API for conditionId lookup (Gamma API doesn't support it well)
    const url = `${CLOB_HOST}/markets/${encodeURIComponent(marketId)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Polymarket CLOB API error: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    const tokens = (data.tokens || []).map((t: any) => ({
      outcome: t.outcome,
      tokenId: t.token_id,
      price: parseFloat(t.price || "0"),
    }));
    return {
      id: data.condition_id || marketId,
      question: data.question || "",
      description: data.description || "",
      outcomes: tokens.map((t: any) => t.outcome),
      volume: 0, // CLOB API doesn't return volume
      liquidity: 0,
      endDate: data.end_date_iso || "",
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
    const data = await this.requireClient().getOrderBook(symbol);
    return {
      symbol,
      asks: (data.asks || []).map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) })),
      bids: (data.bids || []).map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
      timestamp: Date.now(),
    };
  }

  async getCandles(_symbol: string, _interval: string, _count?: number): Promise<Candle[]> {
    throw new Error("Not supported for Polymarket");
  }

  async getBalance(): Promise<Balance[]> {
    const result = await this.requireClient().getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    return [{ currency: "USDC", available: parseFloat(result.balance), locked: 0 }];
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    const [marketId, outcome] = order.symbol.split(":");
    if (!marketId || !outcome) {
      throw new Error('Symbol must be in "marketId:outcome" format (e.g. "0xabc:Yes")');
    }

    if (order.price == null) {
      throw new Error("Price is required for Polymarket orders (probability between 0 and 1)");
    }

    const market = await this.getMarket(marketId);
    const token = market.tokens.find(t => t.outcome === outcome);
    if (!token) {
      throw new Error(`Outcome "${outcome}" not found. Available: ${market.tokens.map(t => t.outcome).join(", ")}`);
    }

    const side = order.side === "buy" ? Side.BUY : Side.SELL;
    const resp = await this.requireClient().createAndPostOrder(
      { tokenID: token.tokenId, price: order.price, size: order.amount, side },
      { tickSize: "0.01" },
      OrderType.GTC,
    );

    if (!resp.success) {
      throw new Error(`Order placement failed: ${resp.errorMsg || "unknown error"}`);
    }

    return {
      id: resp.orderID || "",
      symbol: order.symbol,
      side: order.side,
      type: "limit",
      status: "pending",
      amount: order.amount,
      price: order.price,
      filledAmount: 0,
      filledPrice: null,
      createdAt: new Date().toISOString(),
    };
  }

  async cancelOrder(orderId: string): Promise<OrderResponse> {
    await this.requireClient().cancelOrder({ orderID: orderId });
    return {
      id: orderId,
      symbol: "",
      side: "buy",
      type: "limit",
      status: "cancelled",
      amount: 0,
      price: null,
      filledAmount: 0,
      filledPrice: null,
      createdAt: new Date().toISOString(),
    };
  }

  async getOrder(orderId: string): Promise<OrderResponse> {
    const data = await this.requireClient().getOrder(orderId);
    return {
      id: data.id || orderId,
      symbol: data.asset_id || "",
      side: data.side === "BUY" ? "buy" : "sell",
      type: "limit",
      status: data.status === "MATCHED" ? "filled" : data.status === "CANCELLED" ? "cancelled" : "pending",
      amount: parseFloat(data.original_size || "0"),
      price: parseFloat(data.price || "0"),
      filledAmount: parseFloat(data.size_matched || "0"),
      filledPrice: parseFloat(data.price || "0"),
      createdAt: data.created_at ? new Date(data.created_at).toISOString() : new Date().toISOString(),
    };
  }

  async getOpenOrders(_symbol?: string): Promise<OrderResponse[]> {
    const orders = await this.requireClient().getOpenOrders();
    return orders.map((o) => ({
      id: o.id,
      symbol: o.asset_id || "",
      side: (o.side === "BUY" ? "buy" : "sell") as "buy" | "sell",
      type: "limit" as const,
      status: "pending" as const,
      amount: parseFloat(o.original_size || "0"),
      price: parseFloat(o.price || "0"),
      filledAmount: parseFloat(o.size_matched || "0"),
      filledPrice: parseFloat(o.price || "0"),
      createdAt: o.created_at ? new Date(o.created_at).toISOString() : new Date().toISOString(),
    }));
  }

  async getPositions(): Promise<PredictionPosition[]> {
    return [];
  }
}
