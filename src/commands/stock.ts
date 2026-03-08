import { Command } from "commander";
import chalk from "chalk";
import type { TradeConfig } from "../config/types.js";
import type { ExchangeRegistry } from "../exchanges/registry.js";
import type { RiskManager } from "../risk/manager.js";
import type { OrderRepository, PositionRepository, DailyPnlRepository } from "../db/repository.js";
import { isStockExchange } from "../exchanges/types.js";
import { withErrorHandling, updatePositionAfterOrder } from "./helpers.js";

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
        updatePositionAfterOrder("sell", "stock", opts.via, symbol, order, positionRepo, pnlRepo);
        console.log(chalk.green("Order placed:"), order.id);
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
      // TODO: look up internal order by external_id and update status to 'cancelled'.
      // OrderRepository does not yet have findByExternalId, so this is a known limitation.
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
