import { describe, it, expect } from "vitest";
import { ExchangeRegistry } from "./registry.js";

describe("ExchangeRegistry", () => {
  it("returns registered exchange", () => {
    const registry = new ExchangeRegistry();
    const mockExchange = { name: "upbit" } as any;
    registry.register("cex", "upbit", mockExchange);
    expect(registry.get("cex", "upbit")).toBe(mockExchange);
  });

  it("throws on unregistered exchange lookup", () => {
    const registry = new ExchangeRegistry();
    expect(() => registry.get("cex", "binance")).toThrow("Unregistered");
  });
});
