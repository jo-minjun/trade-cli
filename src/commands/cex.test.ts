import { describe, it, expect, vi } from "vitest";
import { createCexCommand } from "./cex.js";
import { ExchangeRegistry } from "../exchanges/registry.js";

describe("cex CLI", () => {
  it("creates cex command with subcommands", () => {
    const registry = new ExchangeRegistry();
    const mockRisk = {
      check: vi.fn().mockReturnValue({ approved: true }),
    } as any;
    const mockOrderRepo = { create: vi.fn() } as any;
    const mockPositionRepo = { findBySymbol: vi.fn(), upsert: vi.fn() } as any;
    const mockPnlRepo = { record: vi.fn() } as any;
    const cmd = createCexCommand(registry, mockRisk, mockOrderRepo, mockPositionRepo, mockPnlRepo);
    expect(cmd.name()).toBe("cex");
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain("price");
    expect(subcommands).toContain("buy");
    expect(subcommands).toContain("sell");
    expect(subcommands).toContain("cancel");
    expect(subcommands).toContain("balance");
  });
});
