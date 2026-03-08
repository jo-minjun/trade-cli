import { Command } from "commander";
import chalk from "chalk";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, saveConfig, getConfigDir } from "../config/loader.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { stringify } from "yaml";
import type { TradeConfig } from "../config/types.js";
import { withErrorHandling } from "./helpers.js";

function maskSecrets(
  obj: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (
      typeof value === "string" &&
      (key.includes("key") || key.includes("secret") || key.includes("private"))
    ) {
      result[key] = value ? "****" : "(not set)";
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      result[key] = maskSecrets(value as Record<string, unknown>, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split(".");
  for (const key of keys) {
    if (BLOCKED_KEYS.has(key)) {
      throw new Error(`Invalid config key: ${key}`);
    }
  }
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof current[keys[i]] !== "object" || current[keys[i]] === null) {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  if (typeof value === "string") {
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (!isNaN(Number(value)) && value !== "" && !value.startsWith("0x")) value = Number(value);
  }
  current[keys[keys.length - 1]] = value;
}

export function createConfigCommand(config: TradeConfig): Command {
  const cmd = new Command("config").description("Manage configuration");

  cmd
    .command("init")
    .description("Create default config file")
    .action(() => {
      const configDir = getConfigDir();
      const configPath = join(configDir, "config.yaml");
      if (existsSync(configPath)) {
        console.log(chalk.yellow("Config file already exists at"), configPath);
        return;
      }
      saveConfig(DEFAULT_CONFIG);
      console.log(chalk.green("Config file created at"), configPath);
    });

  cmd
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const config = loadConfig();
      const masked = maskSecrets(config as unknown as Record<string, unknown>);
      console.log(stringify(masked));
    });

  cmd
    .command("set")
    .description("Set a configuration value")
    .argument("<key>", "Config key (dot notation, e.g. risk.max-order-size)")
    .argument("<value>", "Value to set")
    .action((key: string, value: string) => {
      const topKey = key.split(".")[0];
      const VALID_TOP_KEYS = ["cex", "stock", "prediction", "risk"];
      if (!VALID_TOP_KEYS.includes(topKey)) {
        console.log(chalk.red(`Invalid config key: ${key}`));
        console.log(`Valid top-level keys: ${VALID_TOP_KEYS.join(", ")}`);
        return;
      }
      const config = loadConfig();
      setNestedValue(config as unknown as Record<string, unknown>, key, value);
      saveConfig(config);
      console.log(chalk.green("Updated"), key, "=", value);
    });

  cmd
    .command("setup")
    .description("Generate API credentials for a platform")
    .option("--via <platform>", "Platform", "polymarket")
    .action(withErrorHandling(async (opts: { via: string }) => {
      if (opts.via !== "polymarket") {
        console.log(chalk.red(`Setup is not supported for: ${opts.via}`));
        return;
      }
      const polyConfig = config.prediction.polymarket as any;
      if (!polyConfig?.["private-key"]) {
        console.log(chalk.red("Set private key first:"), "trade config set prediction.polymarket.private-key 0x...");
        return;
      }
      if (polyConfig["api-key"]) {
        console.log(chalk.yellow("API credentials already exist. Delete them first if you want to regenerate."));
        return;
      }

      const { ClobClient } = await import("@polymarket/clob-client");
      const { Wallet } = await import("ethers");
      const signer = new Wallet(polyConfig["private-key"]);
      const tempClient = new ClobClient("https://clob.polymarket.com", 137, signer);
      const creds = await tempClient.createOrDeriveApiKey();

      console.log(chalk.green("API credentials generated!"));
      console.log("Run these commands to save them:");
      console.log(`  trade config set prediction.polymarket.api-key ${creds.key}`);
      console.log(`  trade config set prediction.polymarket.api-secret ${creds.secret}`);
      console.log(`  trade config set prediction.polymarket.api-passphrase ${creds.passphrase}`);
    }));

  return cmd;
}
