import type { Exchange } from "./types.js";

export class ExchangeRegistry {
  private exchanges = new Map<string, Exchange>();

  register(marketType: string, name: string, exchange: Exchange): void {
    this.exchanges.set(`${marketType}:${name}`, exchange);
  }

  get(marketType: string, name: string): Exchange {
    const key = `${marketType}:${name}`;
    const exchange = this.exchanges.get(key);
    if (!exchange) throw new Error(`Unregistered exchange: ${key}`);
    return exchange;
  }
}
