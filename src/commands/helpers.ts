import chalk from "chalk";
import type { Exchange, OrderResponse } from "../exchanges/types.js";
import type { PositionRepository, DailyPnlRepository, OrderRepository, CreateOrderInput } from "../db/repository.js";

// Wraps async command actions with error handling
export function withErrorHandling(fn: (...args: any[]) => Promise<void>) {
  return async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(chalk.red("Error:"), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  };
}

// Polls order status until filled (for market orders that return "wait"/"pending")
export async function waitForFill(exchange: Exchange, orderId: string, maxRetries = 3): Promise<OrderResponse> {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const order = await exchange.getOrder(orderId);
    if (order.status === "filled" || order.status === "partially_filled") {
      return order;
    }
  }
  // Return last fetched state even if not filled
  return exchange.getOrder(orderId);
}

// Saves order to DB with error recovery — logs warning if DB write fails after exchange order succeeded
export function safeCreateOrder(orderRepo: OrderRepository, input: CreateOrderInput): number | null {
  try {
    return orderRepo.create(input);
  } catch (err) {
    console.error(chalk.yellow("Warning: Order placed on exchange but failed to save to local DB."));
    console.error(chalk.yellow(`  External ID: ${input.external_id}, Symbol: ${input.symbol}, Side: ${input.side}, Amount: ${input.amount}`));
    console.error(chalk.yellow(`  Error: ${err instanceof Error ? err.message : String(err)}`));
    return null;
  }
}

// Updates position and PnL after a successful order
export function updatePositionAfterOrder(
  side: "buy" | "sell",
  marketType: string,
  via: string,
  symbol: string,
  order: OrderResponse,
  positionRepo: PositionRepository,
  pnlRepo: DailyPnlRepository,
): void {
  if (order.status !== "filled" && order.status !== "partially_filled") return;

  const filledQty = order.filledAmount;
  const filledPrice = order.filledPrice ?? order.price ?? 0;
  if (filledQty <= 0 || !filledPrice) return;

  if (side === "buy") {
    const existing = positionRepo.findBySymbol(marketType, via, symbol);
    const prevQty = existing?.quantity ?? 0;
    const prevAvg = existing?.avg_entry_price ?? 0;
    const newQty = prevQty + filledQty;
    const newAvg = newQty > 0 ? (prevQty * prevAvg + filledQty * filledPrice) / newQty : filledPrice;
    positionRepo.upsert({ market_type: marketType, via, symbol, quantity: newQty, avg_entry_price: newAvg });
  } else {
    const existing = positionRepo.findBySymbol(marketType, via, symbol);
    if (existing) {
      const pnl = (filledPrice - existing.avg_entry_price) * filledQty;
      const today = new Date().toISOString().split("T")[0];
      pnlRepo.record(today, marketType, via, pnl, pnl > 0);
      const newQty = Math.max(0, existing.quantity - filledQty);
      positionRepo.upsert({ market_type: marketType, via, symbol, quantity: newQty, avg_entry_price: existing.avg_entry_price });
    }
  }
}
