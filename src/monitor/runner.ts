import type { ExchangeRegistry } from "../exchanges/registry.js";
import type { PositionRepository, OrderRepository } from "../db/repository.js";
import type { RiskConfig } from "../config/types.js";

const CHECK_INTERVAL_MS = 30_000;

export interface MonitorContext {
  registry: ExchangeRegistry;
  positionRepo: PositionRepository;
  orderRepo: OrderRepository;
  riskConfig: RiskConfig;
}

export async function checkStopLoss(ctx: MonitorContext): Promise<string[]> {
  const positions = ctx.positionRepo.listAll();
  const actions: string[] = [];

  for (const pos of positions) {
    try {
      const exchange = ctx.registry.get(pos.market_type, pos.via);
      const ticker = await exchange.getPrice(pos.symbol);
      const stopLossRate =
        ctx.riskConfig[
          pos.market_type as "cex" | "stock" | "prediction"
        ]?.["stop-loss"] ?? 0.05;
      const stopPrice = pos.avg_entry_price * (1 - stopLossRate);

      // Update current price in position
      ctx.positionRepo.upsert({
        market_type: pos.market_type,
        via: pos.via,
        symbol: pos.symbol,
        quantity: pos.quantity,
        avg_entry_price: pos.avg_entry_price,
        current_price: ticker.price,
        unrealized_pnl: (ticker.price - pos.avg_entry_price) * pos.quantity,
      });

      if (ticker.price <= stopPrice) {
        const order = await exchange.placeOrder({
          symbol: pos.symbol,
          side: "sell",
          type: "market",
          amount: pos.quantity,
        });
        ctx.orderRepo.create({
          market_type: pos.market_type,
          via: pos.via,
          symbol: pos.symbol,
          side: "sell",
          type: "market",
          amount: pos.quantity,
          external_id: order.id,
        });
        // Remove position after stop-loss sell
        ctx.positionRepo.upsert({
          market_type: pos.market_type,
          via: pos.via,
          symbol: pos.symbol,
          quantity: 0,
          avg_entry_price: 0,
        });
        actions.push(
          `Stop-loss triggered: ${pos.symbol} (${pos.via}) sold ${pos.quantity} at ${ticker.price}`,
        );
      }
    } catch (err) {
      actions.push(`Error checking ${pos.symbol} (${pos.via}): ${err}`);
    }
  }

  return actions;
}

export function startMonitor(ctx: MonitorContext): NodeJS.Timeout {
  console.log("Stop-loss monitor started. Checking every 30 seconds...");
  const timer = setInterval(async () => {
    const actions = await checkStopLoss(ctx);
    for (const action of actions) {
      console.log(`[${new Date().toISOString()}] ${action}`);
    }
  }, CHECK_INTERVAL_MS);
  return timer;
}
