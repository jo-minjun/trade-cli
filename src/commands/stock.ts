import { Command } from "commander";
import chalk from "chalk";
import type { TradeConfig } from "../config/types.js";
import type { ExchangeRegistry } from "../exchanges/registry.js";
import type { RiskManager } from "../risk/manager.js";
import type { OrderRepository, PositionRepository, DailyPnlRepository } from "../db/repository.js";
import { isStockExchange } from "../exchanges/types.js";
import { withErrorHandling, updatePositionAfterOrder, waitForFill, safeCreateOrder } from "./helpers.js";

export function createStockCommand(
  config: TradeConfig,
  registry: ExchangeRegistry,
  riskManager: RiskManager,
  orderRepo: OrderRepository,
  positionRepo: PositionRepository,
  pnlRepo: DailyPnlRepository,
): Command {
  const cmd = new Command("stock").description("Stock trading commands");

  cmd
    .command("price")
    .description("Get current stock price")
    .argument("<symbol>", "Stock code (e.g. 005930)")
    .option("--via <broker>", "Broker to use", config.stock["default-via"])
    .action(withErrorHandling(async (symbol: string, opts: { via: string }) => {
      const exchange = registry.get("stock", opts.via);
      const ticker = await exchange.getPrice(symbol);
      console.log(chalk.bold(ticker.symbol));
      console.log(`  Price: ${ticker.price.toLocaleString()}`);
      console.log(
        `  Change: ${ticker.change >= 0 ? chalk.green("+" + ticker.change) : chalk.red(ticker.change)} (${(ticker.changeRate * 100).toFixed(2)}%)`,
      );
      console.log(`  Volume: ${ticker.volume24h.toLocaleString()}`);
    }));

  cmd
    .command("balance")
    .description("Get account balance")
    .option("--via <broker>", "Broker to use", config.stock["default-via"])
    .action(withErrorHandling(async (opts: { via: string }) => {
      const exchange = registry.get("stock", opts.via);
      const balances = await exchange.getBalance();
      console.log(chalk.bold("Holdings:"));
      balances.forEach((b) => {
        console.log(
          `  ${b.currency}: ${b.available} shares (locked: ${b.locked})${b.avgBuyPrice ? ` avg: ${b.avgBuyPrice}` : ""}`,
        );
      });
    }));

  cmd
    .command("orders")
    .description("List open orders")
    .option("--via <broker>", "Broker to use", config.stock["default-via"])
    .option("--symbol <symbol>", "Filter by stock code")
    .action(withErrorHandling(async (opts: { via: string; symbol?: string }) => {
      const exchange = registry.get("stock", opts.via);
      const orders = await exchange.getOpenOrders(opts.symbol);
      if (orders.length === 0) {
        console.log("No open orders");
        return;
      }
      console.log(chalk.bold("Open Orders:"));
      orders.forEach((o) => {
        console.log(
          `  ${o.id} | ${o.side.toUpperCase()} ${o.symbol} | ${o.type} | amount: ${o.amount}${o.price ? ` @ ${o.price}` : ""}`,
        );
      });
    }));

  cmd
    .command("buy")
    .description("Place a buy order")
    .argument("<symbol>", "Stock code")
    .argument("<amount>", "Quantity")
    .option("--via <broker>", "Broker to use", config.stock["default-via"])
    .option("--type <type>", "Order type", "market")
    .option("--price <price>", "Limit price")
    .action(
      withErrorHandling(async (
        symbol: string,
        amount: string,
        opts: { via: string; type: string; price?: string },
      ) => {
        const amountNum = parseFloat(amount);
        const exchange = registry.get("stock", opts.via);

        // Compute KRW value for risk check: quantity * price
        let orderValueKrw: number;
        if (opts.price) {
          orderValueKrw = amountNum * parseFloat(opts.price);
        } else {
          const ticker = await exchange.getPrice(symbol);
          orderValueKrw = amountNum * ticker.price;
        }

        const riskResult = riskManager.check({
          market_type: "stock",
          via: opts.via,
          symbol,
          side: "buy",
          amount: orderValueKrw,
        });
        if (!riskResult.approved) {
          console.log(chalk.red("Order rejected:"), riskResult.reason);
          return;
        }

        let order = await exchange.placeOrder({
          symbol,
          side: "buy",
          type: opts.type as "market" | "limit",
          amount: amountNum,
          price: opts.price ? parseFloat(opts.price) : undefined,
        });
        const internalId = safeCreateOrder(orderRepo, {
          market_type: "stock",
          via: opts.via,
          symbol,
          side: "buy",
          type: opts.type as "market" | "limit",
          amount: amountNum,
          price: opts.price ? parseFloat(opts.price) : undefined,
          external_id: order.id,
        });

        // Poll for fill status
        if (order.status !== "filled" && order.status !== "partially_filled") {
          order = await waitForFill(exchange, order.id);
          if (internalId != null && (order.status === "filled" || order.status === "partially_filled")) {
            orderRepo.updateStatus(internalId, order.status, {
              filled_amount: order.filledAmount,
              filled_price: order.filledPrice ?? 0,
            });
          }
        }

        updatePositionAfterOrder("buy", "stock", opts.via, symbol, order, positionRepo, pnlRepo);
        console.log(chalk.green("Order placed:"), order.id);
      }),
    );

  cmd
    .command("sell")
    .description("Place a sell order")
    .argument("<symbol>", "Stock code")
    .argument("<amount>", "Quantity")
    .option("--via <broker>", "Broker to use", config.stock["default-via"])
    .option("--type <type>", "Order type", "market")
    .option("--price <price>", "Limit price")
    .action(
      withErrorHandling(async (
        symbol: string,
        amount: string,
        opts: { via: string; type: string; price?: string },
      ) => {
        const amountNum = parseFloat(amount);
        const riskResult = riskManager.check({
          market_type: "stock",
          via: opts.via,
          symbol,
          side: "sell",
          amount: amountNum,
        });
        if (!riskResult.approved) {
          console.log(chalk.red("Order rejected:"), riskResult.reason);
          return;
        }

        const exchange = registry.get("stock", opts.via);
        let order = await exchange.placeOrder({
          symbol,
          side: "sell",
          type: opts.type as "market" | "limit",
          amount: amountNum,
          price: opts.price ? parseFloat(opts.price) : undefined,
        });
        const internalId = safeCreateOrder(orderRepo, {
          market_type: "stock",
          via: opts.via,
          symbol,
          side: "sell",
          type: opts.type as "market" | "limit",
          amount: amountNum,
          price: opts.price ? parseFloat(opts.price) : undefined,
          external_id: order.id,
        });

        // Poll for fill status
        if (order.status !== "filled" && order.status !== "partially_filled") {
          order = await waitForFill(exchange, order.id);
          if (internalId != null && (order.status === "filled" || order.status === "partially_filled")) {
            orderRepo.updateStatus(internalId, order.status, {
              filled_amount: order.filledAmount,
              filled_price: order.filledPrice ?? 0,
            });
          }
        }

        updatePositionAfterOrder("sell", "stock", opts.via, symbol, order, positionRepo, pnlRepo);
        console.log(chalk.green("Order placed:"), order.id);
      }),
    );

  cmd
    .command("candles")
    .description("Get candle data")
    .argument("<symbol>", "Stock code")
    .option("--via <broker>", "Broker to use", config.stock["default-via"])
    .option("--interval <interval>", "Candle interval (only daily supported)", "1d")
    .option("--count <count>", "Number of candles", "10")
    .action(
      withErrorHandling(async (
        symbol: string,
        opts: { via: string; interval: string; count: string },
      ) => {
        if (opts.interval !== "1d" && opts.interval !== "D") {
          console.log(chalk.yellow("Warning: KIS only supports daily candles. Showing daily data."));
        }
        const exchange = registry.get("stock", opts.via);
        const candles = await exchange.getCandles(
          symbol,
          opts.interval,
          parseInt(opts.count),
        );
        console.log(chalk.bold(`${symbol} Candles (daily)`));
        candles.forEach((c) => {
          const date = new Date(c.timestamp).toISOString().split("T")[0];
          console.log(
            `  ${date} | O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`,
          );
        });
      }),
    );

  cmd
    .command("cancel")
    .description("Cancel an order")
    .argument("<order-id>", "Order ID")
    .option("--via <broker>", "Broker to use", config.stock["default-via"])
    .action(withErrorHandling(async (orderId: string, opts: { via: string }) => {
      const exchange = registry.get("stock", opts.via);
      const result = await exchange.cancelOrder(orderId);
      const internalOrder = orderRepo.findByExternalId(orderId);
      if (internalOrder) {
        orderRepo.updateStatus(internalOrder.id, "cancelled");
      }
      console.log(chalk.green("Order cancelled:"), result.id);
    }));

  cmd
    .command("info")
    .description("Get stock info")
    .argument("<symbol>", "Stock code")
    .option("--via <broker>", "Broker to use", config.stock["default-via"])
    .action(withErrorHandling(async (symbol: string, opts: { via: string }) => {
      const exchange = registry.get("stock", opts.via);
      if (!isStockExchange(exchange)) {
        console.log(chalk.red("Stock info not supported by"), opts.via);
        return;
      }
      const info = await exchange.getStockInfo(symbol);
      console.log(chalk.bold(info.name), `(${info.symbol})`);
      console.log(`  Market: ${info.market}`);
      if (info.per) console.log(`  PER: ${info.per}`);
      if (info.pbr) console.log(`  PBR: ${info.pbr}`);
      if (info.marketCap)
        console.log(`  Market Cap: ${info.marketCap.toLocaleString()}`);
    }));

  return cmd;
}
