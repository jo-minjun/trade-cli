import { Command } from "commander";
import chalk from "chalk";
import type { ExchangeRegistry } from "../exchanges/registry.js";
import type { RiskManager } from "../risk/manager.js";
import type { OrderRepository } from "../db/repository.js";

export function createStockCommand(
  registry: ExchangeRegistry,
  riskManager: RiskManager,
  orderRepo: OrderRepository,
): Command {
  const cmd = new Command("stock").description("Stock trading commands");

  cmd
    .command("price")
    .description("Get current stock price")
    .argument("<symbol>", "Stock code (e.g. 005930)")
    .option("--via <broker>", "Broker to use", "kis")
    .action(async (symbol: string, opts: { via: string }) => {
      const exchange = registry.get("stock", opts.via);
      const ticker = await exchange.getPrice(symbol);
      console.log(chalk.bold(ticker.symbol));
      console.log(`  Price: ${ticker.price.toLocaleString()}`);
      console.log(
        `  Change: ${ticker.change >= 0 ? chalk.green("+" + ticker.change) : chalk.red(ticker.change)} (${(ticker.changeRate * 100).toFixed(2)}%)`,
      );
      console.log(`  Volume: ${ticker.volume24h.toLocaleString()}`);
    });

  cmd
    .command("balance")
    .description("Get account balance")
    .option("--via <broker>", "Broker to use", "kis")
    .action(async (opts: { via: string }) => {
      const exchange = registry.get("stock", opts.via);
      const balances = await exchange.getBalance();
      console.log(chalk.bold("Holdings:"));
      balances.forEach((b) => {
        console.log(
          `  ${b.currency}: ${b.available} shares (locked: ${b.locked})${b.avgBuyPrice ? ` avg: ${b.avgBuyPrice}` : ""}`,
        );
      });
    });

  cmd
    .command("buy")
    .description("Place a buy order")
    .argument("<symbol>", "Stock code")
    .argument("<amount>", "Quantity")
    .option("--via <broker>", "Broker to use", "kis")
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
          market_type: "stock",
          via: opts.via,
          symbol,
          side: "buy",
          amount: amountNum,
        });
        if (!riskResult.approved) {
          console.log(chalk.red("Order rejected:"), riskResult.reason);
          return;
        }

        const exchange = registry.get("stock", opts.via);
        const order = await exchange.placeOrder({
          symbol,
          side: "buy",
          type: opts.type as "market" | "limit",
          amount: amountNum,
          price: opts.price ? parseFloat(opts.price) : undefined,
        });
        orderRepo.create({
          market_type: "stock",
          via: opts.via,
          symbol,
          side: "buy",
          type: opts.type as "market" | "limit",
          amount: amountNum,
          price: opts.price ? parseFloat(opts.price) : undefined,
          external_id: order.id,
        });
        console.log(chalk.green("Order placed:"), order.id);
      },
    );

  cmd
    .command("sell")
    .description("Place a sell order")
    .argument("<symbol>", "Stock code")
    .argument("<amount>", "Quantity")
    .option("--via <broker>", "Broker to use", "kis")
    .option("--type <type>", "Order type", "market")
    .option("--price <price>", "Limit price")
    .action(
      async (
        symbol: string,
        amount: string,
        opts: { via: string; type: string; price?: string },
      ) => {
        const amountNum = parseFloat(amount);
        const exchange = registry.get("stock", opts.via);
        const order = await exchange.placeOrder({
          symbol,
          side: "sell",
          type: opts.type as "market" | "limit",
          amount: amountNum,
          price: opts.price ? parseFloat(opts.price) : undefined,
        });
        orderRepo.create({
          market_type: "stock",
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
    .argument("<order-id>", "Order ID")
    .option("--via <broker>", "Broker to use", "kis")
    .action(async (orderId: string, opts: { via: string }) => {
      const exchange = registry.get("stock", opts.via);
      const result = await exchange.cancelOrder(orderId);
      console.log(chalk.green("Order cancelled:"), result.id);
    });

  cmd
    .command("info")
    .description("Get stock info")
    .argument("<symbol>", "Stock code")
    .option("--via <broker>", "Broker to use", "kis")
    .action(async (symbol: string, opts: { via: string }) => {
      const exchange = registry.get("stock", opts.via) as any;
      if (typeof exchange.getStockInfo !== "function") {
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
    });

  return cmd;
}
