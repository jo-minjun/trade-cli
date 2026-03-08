import type { MonitorConfig, RiskConfig, TradeConfig } from "./types.js";

export const DEFAULT_MONITOR: MonitorConfig = {
  "interval-seconds": 30,
};

export const DEFAULT_RISK: RiskConfig = {
  "max-total-capital": 1000000,
  "max-daily-loss": 50000,
  "max-total-exposure": 0.8,
  "max-order-size": 200000,
  "max-position-ratio": 0.3,
  "circuit-breaker": {
    "consecutive-losses": 5,
    "cooldown-minutes": 60,
  },
  cex: { "max-allocation": 400000, "stop-loss": 0.05 },
  stock: { "max-allocation": 400000, "stop-loss": 0.03 },
  prediction: { "max-allocation": 200000, "stop-loss": 0.1 },
};

export const DEFAULT_CONFIG: TradeConfig = {
  cex: { "default-via": "upbit" },
  stock: { "default-via": "kis" },
  prediction: { "default-via": "polymarket" },
  risk: DEFAULT_RISK,
  monitor: DEFAULT_MONITOR,
};
