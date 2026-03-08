import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import type {
  OrderRepository,
  DailyPnlRepository,
} from "../db/repository.js";

function parsePeriodDays(period: string): number {
  const match = period.match(/^(\d+)\s*(d|w|m)$/i);
  if (!match) {
    const num = parseInt(period);
    return isNaN(num) || num <= 0 ? 7 : num;
  }
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "d") return value;
  if (unit === "w") return value * 7;
  if (unit === "m") return value * 30;
  return 7;
}

function csvEscape(field: unknown): string {
  const str = field == null ? "" : String(field);
  // Prefix formula-triggering characters with a tab to prevent injection
  const safe = /^[=+\-@]/.test(str) ? `\t${str}` : str;
  // Wrap in double quotes and escape internal double quotes
  return `"${safe.replace(/"/g, '""')}"`;
}

export function createHistoryCommand(
  orderRepo: OrderRepository,
  pnlRepo: DailyPnlRepository,
): Command {
  const cmd = new Command("history").description("Trade history");

  cmd
    .command("list")
    .description("List recent orders")
    .option("--via <exchange>", "Filter by exchange")
    .option("--from <date>", "From date (YYYY-MM-DD)")
    .option("--limit <n>", "Limit results", "20")
    .action((opts: { via?: string; from?: string; limit: string }) => {
      const orders = orderRepo.listRecent({
        via: opts.via,
        from: opts.from,
        limit: parseInt(opts.limit),
      });
      if (orders.length === 0) {
        console.log("No orders found");
        return;
      }
      orders.forEach((o) => {
        const date = o.created_at.split("T")[0] || o.created_at;
        const statusColor =
          o.status === "filled"
            ? chalk.green
            : o.status === "cancelled"
              ? chalk.red
              : chalk.yellow;
        console.log(
          `  ${date} | ${o.side.toUpperCase().padEnd(4)} ${o.symbol.padEnd(12)} | ${o.amount.toLocaleString().padStart(12)} | ${statusColor(o.status)} | ${o.via}`,
        );
      });
    });

  cmd
    .command("stats")
    .description("Show trading statistics")
    .option("--period <duration>", "Period (e.g. 7d, 30d)", "7d")
    .action((opts: { period: string }) => {
      const days = parsePeriodDays(opts.period);
      const today = new Date();
      let totalPnl = 0;

      for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];
        const dayPnl = pnlRepo.getTodayTotalPnl(dateStr);
        totalPnl += dayPnl;
      }

      console.log(chalk.bold(`Trading Stats (last ${days} days)`));
      console.log(
        `  Total PnL: ${totalPnl >= 0 ? chalk.green("+" + totalPnl.toLocaleString()) : chalk.red(totalPnl.toLocaleString())}`,
      );
    });

  cmd
    .command("export")
    .description("Export trade history")
    .option("--format <format>", "Export format", "csv")
    .action((opts: { format: string }) => {
      const orders = orderRepo.listRecent({ limit: 10000 });
      if (orders.length === 0) {
        console.log("No orders to export");
        return;
      }
      if (opts.format === "csv") {
        const header =
          "id,date,market_type,via,symbol,side,type,amount,price,filled_amount,filled_price,status";
        const rows = orders.map(
          (o) =>
            [
              o.id,
              o.created_at,
              o.market_type,
              o.via,
              o.symbol,
              o.side,
              o.type,
              o.amount,
              o.price ?? "",
              o.filled_amount,
              o.filled_price ?? "",
              o.status,
            ]
              .map(csvEscape)
              .join(","),
        );
        const csv = [header, ...rows].join("\n");
        const filename = `trade-history-${new Date().toISOString().split("T")[0]}.csv`;
        writeFileSync(filename, csv);
        console.log(chalk.green("Exported to"), filename);
      }
    });

  return cmd;
}
