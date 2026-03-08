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
