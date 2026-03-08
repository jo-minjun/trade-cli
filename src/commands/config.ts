import { Command } from "commander";
import chalk from "chalk";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, saveConfig, getConfigDir } from "../config/loader.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { stringify } from "yaml";

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

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split(".");
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
    else if (!isNaN(Number(value)) && value !== "") value = Number(value);
  }
  current[keys[keys.length - 1]] = value;
}

export function createConfigCommand(): Command {
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
      const config = loadConfig();
      setNestedValue(config as unknown as Record<string, unknown>, key, value);
      saveConfig(config);
      console.log(chalk.green("Updated"), key, "=", value);
    });

  return cmd;
}
