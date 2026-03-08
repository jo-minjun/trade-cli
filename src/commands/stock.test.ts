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
    const cmd = createStockCommand(registry, mockRisk, mockOrderRepo);
    expect(cmd.name()).toBe("stock");
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain("price");
    expect(subcommands).toContain("buy");
    expect(subcommands).toContain("sell");
    expect(subcommands).toContain("info");
  });
});
