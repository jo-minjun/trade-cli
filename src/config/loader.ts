import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "yaml";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { TradeConfig } from "./types.js";

export function getConfigDir(): string {
  return join(homedir(), ".trade-cli");
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function loadConfig(configDir?: string): TradeConfig {
  const dir = configDir ?? getConfigDir();
  const filePath = join(dir, "config.yaml");

  if (!existsSync(filePath)) {
    return structuredClone(DEFAULT_CONFIG);
  }

  const raw = readFileSync(filePath, "utf-8");
  const parsed = parse(raw) ?? {};
  return deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    parsed,
  ) as unknown as TradeConfig;
}

export function saveConfig(config: TradeConfig, configDir?: string): void {
  const dir = configDir ?? getConfigDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const filePath = join(dir, "config.yaml");
  writeFileSync(filePath, stringify(config), { mode: 0o600 });
}
