import { describe, it, expect, vi } from "vitest";
import { createStockCommand } from "./stock.js";
import { ExchangeRegistry } from "../exchanges/registry.js";

describe("stock CLI", () => {
  it("creates stock command with subcommands", () => {
    const registry = new ExchangeRegistry();
    const mockRisk = {
      check: vi.fn().mockReturnValue({ approved: true }),
    } as any;
    const mockOrderRepo = { create: vi.fn() } as any;
    const mockPositionRepo = { findBySymbol: vi.fn(), upsert: vi.fn() } as any;
    const mockPnlRepo = { record: vi.fn() } as any;
    const mockConfig = { cex: { "default-via": "upbit" }, stock: { "default-via": "kis" }, prediction: { "default-via": "polymarket" } } as any;
    const cmd = createStockCommand(mockConfig, registry, mockRisk, mockOrderRepo, mockPositionRepo, mockPnlRepo);
    expect(cmd.name()).toBe("stock");
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain("price");
    expect(subcommands).toContain("buy");
    expect(subcommands).toContain("sell");
    expect(subcommands).toContain("info");
    expect(subcommands).toContain("orders");
    expect(subcommands).toContain("candles");
  });
});
