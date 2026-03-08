import { Command } from "commander";
import chalk from "chalk";
import type { ExchangeRegistry } from "../exchanges/registry.js";
import type { RiskManager } from "../risk/manager.js";
import type { OrderRepository } from "../db/repository.js";

export function createCexCommand(
  registry: ExchangeRegistry,
  riskManager: RiskManager,
  orderRepo: OrderRepository,
): Command {
  const cmd = new Command("cex").description("CEX (crypto exchange) commands");

  cmd
    .command("price")
    .description("Get current price")
    .argument("<symbol>", "Trading pair (e.g. BTC-KRW)")
    .option("--via <exchange>", "Exchange to use", "upbit")
    .action(async (symbol: string, opts: { via: string }) => {
      const exchange = registry.get("cex", opts.via);
      const ticker = await exchange.getPrice(symbol);
      console.log(chalk.bold(ticker.symbol));
      console.log(`  Price: ${ticker.price.toLocaleString()}`);
      console.log(
        `  Change: ${ticker.change >= 0 ? chalk.green("+" + ticker.change) : chalk.red(ticker.change)} (${(ticker.changeRate * 100).toFixed(2)}%)`,
      );
      console.log(`  24h Volume: ${ticker.volume24h.toLocaleString()}`);
      console.log(
        `  24h High/Low: ${ticker.high24h.toLocaleString()} / ${ticker.low24h.toLocaleString()}`,
      );
    });

  cmd
    .command("orderbook")
    .description("Get order book")
    .argument("<symbol>", "Trading pair")
    .option("--via <exchange>", "Exchange to use", "upbit")
    .action(async (symbol: string, opts: { via: string }) => {
      const exchange = registry.get("cex", opts.via);
      const ob = await exchange.getOrderbook(symbol);
      console.log(chalk.bold(`${ob.symbol} Order Book`));
      console.log(chalk.red("  Asks:"));
      ob.asks
        .slice(0, 5)
        .forEach((a) =>
          console.log(`    ${a.price.toLocaleString()} | ${a.size}`),
        );
      console.log(chalk.green("  Bids:"));
      ob.bids
        .slice(0, 5)
        .forEach((b) =>
          console.log(`    ${b.price.toLocaleString()} | ${b.size}`),
        );
    });

  cmd
    .command("candles")
    .description("Get candle data")
    .argument("<symbol>", "Trading pair")
    .option("--via <exchange>", "Exchange to use", "upbit")
    .option("--interval <interval>", "Candle interval", "1h")
    .option("--count <count>", "Number of candles", "10")
    .action(
      async (
        symbol: string,
        opts: { via: string; interval: string; count: string },
      ) => {
        const exchange = registry.get("cex", opts.via);
        const candles = await exchange.getCandles(
          symbol,
          opts.interval,
          parseInt(opts.count),
        );
        console.log(chalk.bold(`${symbol} Candles (${opts.interval})`));
        candles.forEach((c) => {
          const date = new Date(c.timestamp).toISOString().split("T")[0];
          console.log(
            `  ${date} | O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`,
          );
        });
      },
    );

  cmd
    .command("balance")
    .description("Get account balance")
    .option("--via <exchange>", "Exchange to use", "upbit")
    .action(async (opts: { via: string }) => {
      const exchange = registry.get("cex", opts.via);
      const balances = await exchange.getBalance();
      console.log(chalk.bold("Balances:"));
      balances.forEach((b) => {
        console.log(
          `  ${b.currency}: ${b.available} (locked: ${b.locked})${b.avgBuyPrice ? ` avg: ${b.avgBuyPrice}` : ""}`,
        );
      });
    });

  cmd
    .command("buy")
    .description("Place a buy order")
    .argument("<symbol>", "Trading pair")
    .argument("<amount>", "Amount in KRW (market) or quantity (limit)")
    .option("--via <exchange>", "Exchange to use", "upbit")
    .option("--type <type>", "Order type", "market")
    .option("--price <price>", "Limit price")
    .action(
      async (
        symbol: string,
        amount: string,
        opts: { via: string; type: string; price?: string },
      ) => {
        const amountNum = parseFloat(amount);
        const riskResult = riskManager.check({
          market_type: "cex",
          via: opts.via,
          symbol,
          side: "buy",
          amount: amountNum,
        });
        if (!riskResult.approved) {
          console.log(chalk.red("Order rejected:"), riskResult.reason);
          return;
        }

        const exchange = registry.get("cex", opts.via);
        const order = await exchange.placeOrder({
          symbol,
          side: "buy",
          type: opts.type as "market" | "limit",
          amount: amountNum,
          price: opts.price ? parseFloat(opts.price) : undefined,
        });
        orderRepo.create({
          market_type: "cex",
          via: opts.via,
          symbol,
          side: "buy",
          type: opts.type as "market" | "limit",
          amount: amountNum,
          price: opts.price ? parseFloat(opts.price) : undefined,
          external_id: order.id,
        });
        console.log(chalk.green("Order placed:"), order.id);
        console.log(
          `  ${order.side} ${order.symbol} | ${order.type} | amount: ${order.amount}`,
        );
      },
    );

  cmd
    .command("sell")
    .description("Place a sell order")
    .argument("<symbol>", "Trading pair")
    .argument("<amount>", "Quantity to sell")
    .option("--via <exchange>", "Exchange to use", "upbit")
    .option("--type <type>", "Order type", "market")
    .option("--price <price>", "Limit price")
    .action(
      async (
        symbol: string,
        amount: string,
        opts: { via: string; type: string; price?: string },
      ) => {
        const amountNum = parseFloat(amount);
        const riskResult = riskManager.check({
          market_type: "cex",
          via: opts.via,
          symbol,
          side: "sell",
          amount: amountNum,
        });
        if (!riskResult.approved) {
          console.log(chalk.red("Order rejected:"), riskResult.reason);
          return;
        }

        const exchange = registry.get("cex", opts.via);
        const order = await exchange.placeOrder({
          symbol,
          side: "sell",
          type: opts.type as "market" | "limit",
          amount: amountNum,
          price: opts.price ? parseFloat(opts.price) : undefined,
        });
        orderRepo.create({
          market_type: "cex",
          via: opts.via,
          symbol,
          side: "sell",
          type: opts.type as "market" | "limit",
          amount: amountNum,
          price: opts.price ? parseFloat(opts.price) : undefined,
          external_id: order.id,
        });
        console.log(chalk.green("Order placed:"), order.id);
      },
    );

  cmd
    .command("cancel")
    .description("Cancel an order")
    .argument("<order-id>", "Order ID to cancel")
    .option("--via <exchange>", "Exchange to use", "upbit")
    .action(async (orderId: string, opts: { via: string }) => {
      const exchange = registry.get("cex", opts.via);
      const result = await exchange.cancelOrder(orderId);
      console.log(chalk.green("Order cancelled:"), result.id);
    });

  return cmd;
}
