import { Command } from "commander";
import chalk from "chalk";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";
import { getConfigDir } from "../config/loader.js";
import type { PolymarketCredentials } from "../config/types.js";
import {
  installLaunchAgent,
  uninstallLaunchAgent,
  startLaunchAgent,
  stopLaunchAgent,
  getLaunchAgentStatus,
} from "../monitor/launchd.js";

export function createMonitorCommand(): Command {
  const cmd = new Command("monitor").description("Stop-loss monitor daemon");

  cmd
    .command("install")
    .description("Install and start the monitor daemon")
    .action(() => {
      const logDir = join(getConfigDir(), "logs");
      mkdirSync(logDir, { recursive: true });
      const tradePath = resolve(process.argv[1] || "trade");
      installLaunchAgent(tradePath);
      console.log(chalk.green("Monitor daemon installed and started"));
    });

  cmd
    .command("uninstall")
    .description("Stop and remove the monitor daemon")
    .action(() => {
      uninstallLaunchAgent();
      console.log(chalk.green("Monitor daemon removed"));
    });

  cmd
    .command("start")
    .description("Start the monitor daemon")
    .action(() => {
      startLaunchAgent();
      console.log(chalk.green("Monitor daemon started"));
    });

  cmd
    .command("stop")
    .description("Stop the monitor daemon")
    .action(() => {
      stopLaunchAgent();
      console.log(chalk.green("Monitor daemon stopped"));
    });

  cmd
    .command("status")
    .description("Check monitor daemon status")
    .action(() => {
      const status = getLaunchAgentStatus();
      const color =
        status === "running"
          ? chalk.green
          : status === "stopped"
            ? chalk.yellow
            : chalk.red;
      console.log(`Monitor daemon: ${color(status)}`);
    });

  cmd
    .command("run")
    .description("Run the monitor (used by launchd)")
    .action(async () => {
      const { loadConfig } = await import("../config/loader.js");
      const { openDatabase } = await import("../db/database.js");
      const { PositionRepository, OrderRepository, DailyPnlRepository } =
        await import("../db/repository.js");
      const { ExchangeRegistry } = await import("../exchanges/registry.js");
      const { startMonitor } = await import("../monitor/runner.js");
      const { RiskManager } = await import("../risk/manager.js");
      const { UpbitExchange } = await import("../exchanges/upbit/client.js");
      const { KisExchange } = await import("../exchanges/kis/client.js");
      const { PolymarketExchange } = await import(
        "../exchanges/polymarket/client.js"
      );

      const config = loadConfig();
      const db = openDatabase();
      const registry = new ExchangeRegistry();

      // Register exchanges from config
      const upbitConfig = config.cex.upbit as
        | { "api-key"?: string; "secret-key"?: string }
        | undefined;
      if (upbitConfig?.["api-key"]) {
        registry.register(
          "cex",
          "upbit",
          new UpbitExchange(
            upbitConfig["api-key"],
            upbitConfig["secret-key"] ?? "",
          ),
        );
      }

      const kisConfig = config.stock.kis as
        | {
            "app-key"?: string;
            "app-secret"?: string;
            "account-no"?: string;
          }
        | undefined;
      if (kisConfig?.["app-key"]) {
        registry.register(
          "stock",
          "kis",
          new KisExchange(
            kisConfig["app-key"],
            kisConfig["app-secret"] ?? "",
            kisConfig["account-no"] ?? "",
          ),
        );
      }

      const polyConfig = config.prediction.polymarket as
        | PolymarketCredentials
        | undefined;
      if (polyConfig?.["private-key"]) {
        registry.register(
          "prediction",
          "polymarket",
          new PolymarketExchange(polyConfig),
        );
      }

      const positionRepo = new PositionRepository(db);
      const orderRepo = new OrderRepository(db);
      const pnlRepo = new DailyPnlRepository(db);
      const riskManager = new RiskManager(config.risk, db);

      startMonitor({
        registry,
        positionRepo,
        orderRepo,
        pnlRepo,
        riskManager,
        config: { stopLossPercent: config.risk.cex["stop-loss"] },
      });
    });

  return cmd;
}
