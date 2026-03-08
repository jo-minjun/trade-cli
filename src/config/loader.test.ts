import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, saveConfig } from "./loader.js";
import { DEFAULT_CONFIG } from "./defaults.js";

describe("config loader", () => {
  const testDir = join(import.meta.dirname, "../../.test-trade-cli");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    const config = loadConfig(testDir);
    expect(config.risk["max-total-capital"]).toBe(1000000);
    expect(config.cex["default-via"]).toBe("upbit");
  });

  it("saves and loads config", () => {
    const config = { ...DEFAULT_CONFIG };
    config.risk = { ...config.risk, "max-total-capital": 2000000 };
    saveConfig(config, testDir);

    const loaded = loadConfig(testDir);
    expect(loaded.risk["max-total-capital"]).toBe(2000000);
  });

  it("overrides defaults with config file values", () => {
    const partial = "risk:\n  max-total-capital: 500000\n";
    writeFileSync(join(testDir, "config.yaml"), partial);

    const config = loadConfig(testDir);
    expect(config.risk["max-total-capital"]).toBe(500000);
    // Other defaults remain
    expect(config.risk["max-daily-loss"]).toBe(50000);
  });
});
