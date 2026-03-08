import { Command } from "commander";
import { loadConfig } from "./config/loader.js";
import { openDatabase } from "./db/database.js";
import { OrderRepository, PositionRepository, DailyPnlRepository } from "./db/repository.js";
import { RiskManager } from "./risk/manager.js";
import { ExchangeRegistry } from "./exchanges/registry.js";
import { UpbitExchange } from "./exchanges/upbit/client.js";
import { KisExchange } from "./exchanges/kis/client.js";
import { PolymarketExchange } from "./exchanges/polymarket/client.js";
import { createConfigCommand } from "./commands/config.js";
import { createCexCommand } from "./commands/cex.js";
import { createStockCommand } from "./commands/stock.js";
import { createPredictionCommand } from "./commands/prediction.js";
import { createRiskCommand } from "./commands/risk.js";
import { createPositionCommand } from "./commands/position.js";
import { createHistoryCommand } from "./commands/history.js";
import { createMonitorCommand } from "./commands/monitor.js";

const config = loadConfig();
const db = openDatabase();
const orderRepo = new OrderRepository(db);
const positionRepo = new PositionRepository(db);
const pnlRepo = new DailyPnlRepository(db);
const riskManager = new RiskManager(config.risk, db);
const registry = new ExchangeRegistry();

// Register exchanges from config
const upbitConfig = config.cex.upbit as { "api-key"?: string; "secret-key"?: string } | undefined;
if (upbitConfig?.["api-key"]) {
  registry.register("cex", "upbit", new UpbitExchange(upbitConfig["api-key"], upbitConfig["secret-key"] ?? ""));
}

const kisConfig = config.stock.kis as { "app-key"?: string; "app-secret"?: string; "account-no"?: string } | undefined;
if (kisConfig?.["app-key"]) {
  registry.register("stock", "kis", new KisExchange(kisConfig["app-key"], kisConfig["app-secret"] ?? "", kisConfig["account-no"] ?? ""));
}

const polyConfig = config.prediction.polymarket as { "private-key"?: string; "api-key"?: string; "api-secret"?: string; "api-passphrase"?: string; "funder-address"?: string } | undefined;
registry.register("prediction", "polymarket", new PolymarketExchange(polyConfig));

const program = new Command();

program
  .name("trade")
  .description("Trading CLI tool for OpenClaw AI agents")
  .version("0.1.0");

program.addCommand(createConfigCommand(config));
program.addCommand(createCexCommand(config, registry, riskManager, orderRepo, positionRepo, pnlRepo));
program.addCommand(createStockCommand(config, registry, riskManager, orderRepo, positionRepo, pnlRepo));
program.addCommand(createPredictionCommand(config, registry, riskManager, orderRepo, positionRepo, pnlRepo));
program.addCommand(createRiskCommand(riskManager));
program.addCommand(createPositionCommand(positionRepo));
program.addCommand(createHistoryCommand(orderRepo, pnlRepo));
program.addCommand(createMonitorCommand());

program.parse();
