export interface ExchangeCredentials {
  "api-key": string;
  "secret-key": string;
}

export interface KisCredentials {
  "app-key": string;
  "app-secret": string;
  "account-no": string;
}

export interface PolymarketCredentials {
  "private-key": string;
  "api-key"?: string;
  "api-secret"?: string;
  "api-passphrase"?: string;
  "funder-address"?: string;
}

export interface CircuitBreakerConfig {
  "consecutive-losses": number;
  "cooldown-minutes": number;
}

export interface MarketRiskConfig {
  "max-allocation": number;
  "stop-loss": number;
}

export interface RiskConfig {
  "max-total-capital": number;
  "max-daily-loss": number;
  "max-total-exposure": number;
  "max-order-size": number;
  "max-position-ratio": number;
  "circuit-breaker": CircuitBreakerConfig;
  cex: MarketRiskConfig;
  stock: MarketRiskConfig;
  prediction: MarketRiskConfig;
}

export interface MonitorConfig {
  "interval-seconds": number;
  "on-stop-loss-hook"?: string;
}

export interface TradeConfig {
  cex: {
    "default-via": string;
    [exchange: string]: unknown;
  };
  stock: {
    "default-via": string;
    [broker: string]: unknown;
  };
  prediction: {
    "default-via": string;
    [platform: string]: unknown;
  };
  risk: RiskConfig;
  monitor: MonitorConfig;
}
