import type { ExchangeRegistry } from "../exchanges/registry.js";
import type {
  PositionRepository,
  OrderRepository,
  DailyPnlRepository,
} from "../db/repository.js";
import type { RiskManager } from "../risk/manager.js";
import type { RiskConfig } from "../config/types.js";
import { executeStopLossHook, type StopLossHookPayload } from "./hooks.js";

const DEFAULT_INTERVAL_MS = 30_000;

export interface MonitorContext {
  registry: ExchangeRegistry;
  positionRepo: PositionRepository;
  orderRepo: OrderRepository;
  pnlRepo: DailyPnlRepository;
  riskManager: RiskManager;
  riskConfig: RiskConfig;
  intervalMs?: number;
  onStopLossHook?: string;
}

export async function checkStopLoss(ctx: MonitorContext): Promise<string[]> {
  const positions = ctx.positionRepo.listAll();
  const actions: string[] = [];

  for (const pos of positions) {
    try {
      const exchange = ctx.registry.get(pos.market_type, pos.via);
      const ticker = await exchange.getPrice(pos.symbol);
      const marketType = pos.market_type as "cex" | "stock" | "prediction";
      const stopLossPercent = ctx.riskConfig[marketType]?.["stop-loss"] ?? 0.05;
      const stopPrice = pos.avg_entry_price * (1 - stopLossPercent);

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

        if (order.status === "filled" || order.status === "partially_filled") {
          const soldQty = order.filledAmount ?? pos.quantity;
          const sellPrice = order.filledPrice ?? ticker.price;
          const pnl = (sellPrice - pos.avg_entry_price) * soldQty;
          const today = new Date().toISOString().split("T")[0];
          ctx.pnlRepo.record(today, pos.market_type, pos.via, pnl, false);
          ctx.riskManager.recordLoss();

          // Reduce position by filled quantity only
          const remainingQty = Math.max(0, pos.quantity - soldQty);
          ctx.positionRepo.upsert({
            market_type: pos.market_type,
            via: pos.via,
            symbol: pos.symbol,
            quantity: remainingQty,
            avg_entry_price: remainingQty > 0 ? pos.avg_entry_price : 0,
          });
          actions.push(
            `Stop-loss triggered: ${pos.symbol} (${pos.via}) sold ${soldQty} at ${sellPrice}`,
          );

          if (ctx.onStopLossHook) {
            const hookPayload: StopLossHookPayload = {
              event: "stop-loss",
              timestamp: new Date().toISOString(),
              symbol: pos.symbol,
              market_type: pos.market_type,
              side: "sell",
              quantity: soldQty,
              entry_price: pos.avg_entry_price,
              stop_price: stopPrice,
              execution_price: sellPrice,
              realized_pnl: pnl,
              order_id: order.id,
            };
            executeStopLossHook(ctx.onStopLossHook, hookPayload);
          }
        } else {
          actions.push(
            `Stop-loss order pending: ${pos.symbol} (${pos.via}) order ${order.id} awaiting fill`,
          );
        }
      }
    } catch (err) {
      actions.push(`Error checking ${pos.symbol} (${pos.via}): ${err}`);
    }
  }

  return actions;
}

export function startMonitor(ctx: MonitorContext): NodeJS.Timeout {
  const intervalMs = ctx.intervalMs ?? DEFAULT_INTERVAL_MS;
  const intervalSec = Math.round(intervalMs / 1000);
  console.log(`Stop-loss monitor started. Checking every ${intervalSec} seconds...`);
  const timer = setInterval(async () => {
    const actions = await checkStopLoss(ctx);
    for (const action of actions) {
      console.log(`[${new Date().toISOString()}] ${action}`);
    }
  }, intervalMs);
  return timer;
}
