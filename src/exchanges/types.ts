export interface Ticker {
  symbol: string;
  price: number;
  change: number;
  changeRate: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface OrderbookEntry {
  price: number;
  size: number;
}

export interface Orderbook {
  symbol: string;
  asks: OrderbookEntry[];
  bids: OrderbookEntry[];
  timestamp: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Balance {
  currency: string;
  available: number;
  locked: number;
  avgBuyPrice?: number;
}

export interface OrderRequest {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  amount: number;
  price?: number;
}

export interface OrderResponse {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  status: "pending" | "filled" | "partially_filled" | "cancelled";
  amount: number;
  price: number | null;
  filledAmount: number;
  filledPrice: number | null;
  createdAt: string;
}

export interface Exchange {
  name: string;
  getPrice(symbol: string): Promise<Ticker>;
  getOrderbook(symbol: string): Promise<Orderbook>;
  getCandles(symbol: string, interval: string, count?: number): Promise<Candle[]>;
  getBalance(): Promise<Balance[]>;
  placeOrder(order: OrderRequest): Promise<OrderResponse>;
  cancelOrder(orderId: string): Promise<OrderResponse>;
  getOrder(orderId: string): Promise<OrderResponse>;
  getOpenOrders(symbol?: string): Promise<OrderResponse[]>;
}

export interface StockInfo {
  symbol: string;
  name: string;
  market: string;
  per?: number;
  pbr?: number;
  marketCap?: number;
}

export interface StockExchange extends Exchange {
  getStockInfo(symbol: string): Promise<StockInfo>;
}

export function isStockExchange(e: Exchange): e is StockExchange {
  return typeof (e as StockExchange).getStockInfo === "function";
}

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

export interface PredictionExchange extends Exchange {
  searchMarkets(query: string): Promise<PredictionMarket[]>;
  getMarket(marketId: string): Promise<PredictionMarketDetail>;
  getPositions(): Promise<PredictionPosition[]>;
}

export function isPredictionExchange(e: Exchange): e is PredictionExchange {
  return (
    typeof (e as PredictionExchange).searchMarkets === "function" &&
    typeof (e as PredictionExchange).getMarket === "function" &&
    typeof (e as PredictionExchange).getPositions === "function"
  );
}
