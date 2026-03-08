import { Command } from "commander";
import chalk from "chalk";
import type { TradeConfig } from "../config/types.js";
import type { ExchangeRegistry } from "../exchanges/registry.js";
import type { RiskManager } from "../risk/manager.js";
import type { OrderRepository, PositionRepository, DailyPnlRepository } from "../db/repository.js";
import { isPredictionExchange } from "../exchanges/types.js";
import { withErrorHandling, updatePositionAfterOrder } from "./helpers.js";

export function createPredictionCommand(
  config: TradeConfig,
  registry: ExchangeRegistry,
  riskManager: RiskManager,
  orderRepo: OrderRepository,
  positionRepo: PositionRepository,
  pnlRepo: DailyPnlRepository,
): Command {
  const cmd = new Command("prediction").description(
    "Prediction market commands",
  );

  cmd
    .command("markets")
    .description("Search prediction markets")
    .option("--via <platform>", "Platform to use", config.prediction["default-via"])
    .option("--query <keyword>", "Search keyword")
    .action(withErrorHandling(async (opts: { via: string; query?: string }) => {
      const exchange = registry.get("prediction", opts.via);
      if (!isPredictionExchange(exchange)) {
        console.log(chalk.red("Market search not supported by"), opts.via);
        return;
      }
      const markets = await exchange.searchMarkets(opts.query || "");
      markets.forEach((m) => {
        console.log(chalk.bold(m.question));
        console.log(`  ID: ${m.id}`);
        console.log(
          `  Volume: $${m.volume.toLocaleString()} | Liquidity: $${m.liquidity.toLocaleString()}`,
        );
        console.log(`  Ends: ${m.endDate}`);
        console.log();
      });
    }));

  cmd
    .command("market")
    .description("Get market details")
    .argument("<market-id>", "Market ID")
    .option("--via <platform>", "Platform to use", config.prediction["default-via"])
    .action(withErrorHandling(async (marketId: string, opts: { via: string }) => {
      const exchange = registry.get("prediction", opts.via);
      if (!isPredictionExchange(exchange)) {
        console.log(chalk.red("Market details not supported by"), opts.via);
        return;
      }
      const market = await exchange.getMarket(marketId);
      console.log(chalk.bold(market.question));
      console.log(`  ${market.description}`);
      console.log(`  Volume: $${market.volume.toLocaleString()}`);
      if (market.tokens) {
        market.tokens.forEach((t) => {
          console.log(`  ${t.outcome}: ${(t.price * 100).toFixed(1)}%`);
        });
      }
    }));

  cmd
    .command("buy")
    .description("Buy prediction shares")
    .argument("<market-id>", "Market ID")
    .argument("<outcome>", "Outcome (YES/NO)")
    .argument("<amount>", "Amount in USDC")
    .option("--via <platform>", "Platform to use", config.prediction["default-via"])
    .action(
      withErrorHandling(async (
        marketId: string,
        outcome: string,
        amount: string,
        opts: { via: string },
      ) => {
        const amountNum = parseFloat(amount);
        const riskResult = riskManager.check({
          market_type: "prediction",
          via: opts.via,
          symbol: marketId,
          side: "buy",
          amount: amountNum,
        });
        if (!riskResult.approved) {
          console.log(chalk.red("Order rejected:"), riskResult.reason);
          return;
        }
        const exchange = registry.get("prediction", opts.via);
        const order = await exchange.placeOrder({
          symbol: `${marketId}:${outcome}`,
          side: "buy",
          type: "limit",
          amount: amountNum,
        });
        orderRepo.create({
          market_type: "prediction",
          via: opts.via,
          symbol: `${marketId}:${outcome}`,
          side: "buy",
          type: "limit",
          amount: amountNum,
          external_id: order.id,
        });
        updatePositionAfterOrder("buy", "prediction", opts.via, `${marketId}:${outcome}`, order, positionRepo, pnlRepo);
        console.log(chalk.green("Order placed:"), order.id);
      }),
    );

  cmd
    .command("sell")
    .description("Sell prediction shares")
    .argument("<market-id>", "Market ID")
    .argument("<outcome>", "Outcome (YES/NO)")
    .argument("<amount>", "Amount")
    .option("--via <platform>", "Platform to use", config.prediction["default-via"])
    .action(
      withErrorHandling(async (
        marketId: string,
        outcome: string,
        amount: string,
        opts: { via: string },
      ) => {
        const amountNum = parseFloat(amount);
        const riskResult = riskManager.check({
          market_type: "prediction",
          via: opts.via,
          symbol: marketId,
          side: "sell",
          amount: amountNum,
        });
        if (!riskResult.approved) {
          console.log(chalk.red("Order rejected:"), riskResult.reason);
          return;
        }
        const exchange = registry.get("prediction", opts.via);
        const order = await exchange.placeOrder({
          symbol: `${marketId}:${outcome}`,
          side: "sell",
          type: "limit",
          amount: amountNum,
        });
        orderRepo.create({
          market_type: "prediction",
          via: opts.via,
          symbol: `${marketId}:${outcome}`,
          side: "sell",
          type: "limit",
          amount: amountNum,
          external_id: order.id,
        });
        updatePositionAfterOrder("sell", "prediction", opts.via, `${marketId}:${outcome}`, order, positionRepo, pnlRepo);
        console.log(chalk.green("Order placed:"), order.id);
      }),
    );

  cmd
    .command("positions")
    .description("Show prediction positions")
    .option("--via <platform>", "Platform to use", config.prediction["default-via"])
    .action(withErrorHandling(async (opts: { via: string }) => {
      const exchange = registry.get("prediction", opts.via);
      if (!isPredictionExchange(exchange)) {
        console.log(chalk.red("Positions not supported by"), opts.via);
        return;
      }
      const positions = await exchange.getPositions();
      if (positions.length === 0) {
        console.log("No open positions");
        return;
      }
      positions.forEach((p) => {
        console.log(
          `  ${p.marketId} ${p.outcome}: ${p.size} @ ${p.avgPrice} (current: ${p.currentPrice})`,
        );
      });
    }));

  return cmd;
}
