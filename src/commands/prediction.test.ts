import { describe, it, expect, vi } from "vitest";
import { createPredictionCommand } from "./prediction.js";
import { ExchangeRegistry } from "../exchanges/registry.js";

describe("prediction CLI", () => {
  it("creates prediction command with subcommands", () => {
    const registry = new ExchangeRegistry();
    const mockRisk = {
      check: vi.fn().mockReturnValue({ approved: true }),
    } as any;
    const mockOrderRepo = { create: vi.fn() } as any;
    const mockPositionRepo = { findBySymbol: vi.fn(), upsert: vi.fn() } as any;
    const mockPnlRepo = { record: vi.fn() } as any;
    const mockConfig = { cex: { "default-via": "upbit" }, stock: { "default-via": "kis" }, prediction: { "default-via": "polymarket" } } as any;
    const cmd = createPredictionCommand(mockConfig, registry, mockRisk, mockOrderRepo, mockPositionRepo, mockPnlRepo);
    expect(cmd.name()).toBe("prediction");
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain("markets");
    expect(subcommands).toContain("market");
    expect(subcommands).toContain("buy");
    expect(subcommands).toContain("sell");
    expect(subcommands).toContain("positions");
  });
});
