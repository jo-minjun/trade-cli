import { Command } from "commander";
import chalk from "chalk";
import type { RiskManager } from "../risk/manager.js";
import { loadConfig, saveConfig } from "../config/loader.js";

export function createRiskCommand(riskManager: RiskManager): Command {
  const cmd = new Command("risk").description("Risk management commands");

  cmd
    .command("check")
    .description("Check if an order passes risk limits")
    .argument("<market-type>", "Market type (cex, stock, prediction)")
    .argument("<symbol>", "Symbol")
    .argument("<amount>", "Amount")
    .option("--via <exchange>", "Exchange/broker")
    .action(
      (
        marketType: string,
        symbol: string,
        amount: string,
        opts: { via?: string },
      ) => {
        const result = riskManager.check({
          market_type: marketType as "cex" | "stock" | "prediction",
          via: opts.via || "",
          symbol,
          side: "buy",
          amount: parseFloat(amount),
        });
        if (result.approved) {
          console.log(chalk.green("✓ Order would be approved"));
        } else {
          console.log(chalk.red("✗ Order would be rejected:"), result.reason);
        }
      },
    );

  cmd
    .command("status")
    .description("Show current risk status")
    .action(() => {
      const status = riskManager.status();
      const config = loadConfig();
      console.log(chalk.bold("Risk Status"));
      console.log(
        `  Circuit Breaker: ${status.circuitBreaker ? chalk.red("ACTIVE") : chalk.green("inactive")}`,
      );
      console.log(`  Consecutive Losses: ${status.consecutiveLosses}`);
      if (status.circuitBreakerUntil) {
        console.log(`  Expires: ${status.circuitBreakerUntil}`);
      }
      console.log(chalk.bold("\nLimits"));
      console.log(
        `  Max Total Capital: ${config.risk["max-total-capital"].toLocaleString()}`,
      );
      console.log(
        `  Max Daily Loss: ${config.risk["max-daily-loss"].toLocaleString()}`,
      );
      console.log(
        `  Max Order Size: ${config.risk["max-order-size"].toLocaleString()}`,
      );
      console.log(
        `  Max Total Exposure: ${(config.risk["max-total-exposure"] * 100).toFixed(0)}%`,
      );
      console.log(
        `  Max Position Ratio: ${(config.risk["max-position-ratio"] * 100).toFixed(0)}%`,
      );
    });

  cmd
    .command("set")
    .description("Set a risk parameter")
    .argument("<key>", "Risk key (e.g. max-order-size)")
    .argument("<value>", "Value")
    .action((key: string, value: string) => {
      const config = loadConfig();
      const numValue = Number(value);
      if (isNaN(numValue)) {
        console.log(chalk.red("Value must be a number"));
        return;
      }
      (config.risk as any)[key] = numValue;
      saveConfig(config);
      console.log(chalk.green("Updated risk.") + key, "=", numValue);
    });

  cmd
    .command("reset-circuit-breaker")
    .description("Reset the circuit breaker")
    .action(() => {
      riskManager.resetCircuitBreaker();
      console.log(chalk.green("Circuit breaker reset"));
    });

  return cmd;
}
