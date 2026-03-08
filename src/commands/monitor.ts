import { Command } from "commander";
import chalk from "chalk";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../config/loader.js";
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
      const { PositionRepository, OrderRepository } = await import(
        "../db/repository.js"
      );
      const { ExchangeRegistry } = await import("../exchanges/registry.js");
      const { startMonitor } = await import("../monitor/runner.js");

      const config = loadConfig();
      const db = openDatabase();
      const registry = new ExchangeRegistry();

      startMonitor({
        registry,
        positionRepo: new PositionRepository(db),
        orderRepo: new OrderRepository(db),
        riskConfig: config.risk,
      });
    });

  return cmd;
}
