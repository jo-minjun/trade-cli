import { Command } from "commander";
import chalk from "chalk";
import type { PositionRepository } from "../db/repository.js";

export function createPositionCommand(
  positionRepo: PositionRepository,
): Command {
  const cmd = new Command("position").description("Position management");

  cmd
    .command("summary")
    .description("Show portfolio summary")
    .action(() => {
      const positions = positionRepo.listAll();
      if (positions.length === 0) {
        console.log("No open positions");
        return;
      }

      const totalExposure = positionRepo.totalExposure();
      console.log(chalk.bold("Portfolio Summary"));
      console.log(`  Total Exposure: ${totalExposure.toLocaleString()}`);
      console.log();

      positions.forEach((p) => {
        const value = p.quantity * p.avg_entry_price;
        const pnl = p.unrealized_pnl ?? 0;
        const pnlStr =
          pnl >= 0
            ? chalk.green(`+${pnl.toLocaleString()}`)
            : chalk.red(pnl.toLocaleString());
        console.log(`  ${chalk.bold(p.symbol)} (${p.market_type}/${p.via})`);
        console.log(
          `    Qty: ${p.quantity} | Avg: ${p.avg_entry_price.toLocaleString()} | Value: ${value.toLocaleString()} | PnL: ${pnlStr}`,
        );
      });
    });

  return cmd;
}
