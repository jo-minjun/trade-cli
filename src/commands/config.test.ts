import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, saveConfig } from "../config/loader.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { createConfigCommand } from "./config.js";

describe("config commands", () => {
  const testDir = join(import.meta.dirname, "../../.test-config-cmd");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("init creates config file", () => {
    saveConfig(DEFAULT_CONFIG, testDir);
    expect(existsSync(join(testDir, "config.yaml"))).toBe(true);
  });

  it("set updates a nested config value", () => {
    saveConfig(DEFAULT_CONFIG, testDir);
    const config = loadConfig(testDir);
    (config as any).risk["max-order-size"] = 500000;
    saveConfig(config, testDir);
    const loaded = loadConfig(testDir);
    expect(loaded.risk["max-order-size"]).toBe(500000);
  });

  it("set rejects invalid top-level keys", async () => {
    saveConfig(DEFAULT_CONFIG, testDir);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const cmd = createConfigCommand();
    // Invoke the set subcommand with an invalid top-level key
    await cmd.parseAsync(["set", "exchanges.upbit.access-key", "test-value"], {
      from: "user",
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid config key"),
    );
    consoleSpy.mockRestore();
  });
});
