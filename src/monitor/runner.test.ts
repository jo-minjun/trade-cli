import { describe, it, expect, vi } from "vitest";
import { checkStopLoss } from "./runner.js";
import type { MonitorContext } from "./runner.js";

function createRiskConfig(overrides?: Record<string, unknown>) {
  return {
    "max-total-capital": 1000000,
    "max-daily-loss": 50000,
    "max-total-exposure": 0.8,
    "max-order-size": 200000,
    "max-position-ratio": 0.3,
    "circuit-breaker": { "consecutive-losses": 5, "cooldown-minutes": 60 },
    cex: { "max-allocation": 400000, "stop-loss": 0.05 },
    stock: { "max-allocation": 400000, "stop-loss": 0.03 },
    prediction: { "max-allocation": 200000, "stop-loss": 0.1 },
    ...overrides,
  };
}

describe("Stop-loss monitor", () => {
  it("triggers stop-loss when price drops below threshold", async () => {
    const mockExchange = {
      name: "upbit",
      getPrice: vi.fn().mockResolvedValue({ price: 95000, symbol: "BTC-KRW" }),
      placeOrder: vi.fn().mockResolvedValue({ id: "sl-001" }),
    };
    const mockRegistry = {
      get: vi.fn().mockReturnValue(mockExchange),
    };
    const mockPositionRepo = {
      listAll: vi.fn().mockReturnValue([
        {
          market_type: "cex",
          via: "upbit",
          symbol: "BTC-KRW",
          quantity: 0.01,
          avg_entry_price: 100000,
          current_price: null,
          unrealized_pnl: null,
        },
      ]),
      upsert: vi.fn(),
    };
    const mockOrderRepo = { create: vi.fn() };

    const ctx: MonitorContext = {
      registry: mockRegistry as any,
      positionRepo: mockPositionRepo as any,
      orderRepo: mockOrderRepo as any,
      riskConfig: createRiskConfig() as any,
    };

    const actions = await checkStopLoss(ctx);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toContain("Stop-loss triggered");
    expect(mockExchange.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell", type: "market" }),
    );
    // Position should be updated with current price, then zeroed out
    expect(mockPositionRepo.upsert).toHaveBeenCalledTimes(2);
    expect(mockOrderRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        side: "sell",
        type: "market",
        external_id: "sl-001",
      }),
    );
  });

  it("does nothing when price is above stop-loss threshold", async () => {
    const mockExchange = {
      name: "upbit",
      getPrice: vi
        .fn()
        .mockResolvedValue({ price: 98000, symbol: "BTC-KRW" }),
    };
    const mockRegistry = { get: vi.fn().mockReturnValue(mockExchange) };
    const mockPositionRepo = {
      listAll: vi.fn().mockReturnValue([
        {
          market_type: "cex",
          via: "upbit",
          symbol: "BTC-KRW",
          quantity: 0.01,
          avg_entry_price: 100000,
        },
      ]),
      upsert: vi.fn(),
    };

    const ctx: MonitorContext = {
      registry: mockRegistry as any,
      positionRepo: mockPositionRepo as any,
      orderRepo: { create: vi.fn() } as any,
      riskConfig: createRiskConfig() as any,
    };

    const actions = await checkStopLoss(ctx);

    expect(actions).toHaveLength(0);
    // Price should still be updated
    expect(mockPositionRepo.upsert).toHaveBeenCalledTimes(1);
    expect(mockPositionRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        current_price: 98000,
        unrealized_pnl: (98000 - 100000) * 0.01,
      }),
    );
  });

  it("reports errors without crashing", async () => {
    const mockRegistry = {
      get: vi.fn().mockImplementation(() => {
        throw new Error("Exchange not found");
      }),
    };
    const mockPositionRepo = {
      listAll: vi.fn().mockReturnValue([
        {
          market_type: "cex",
          via: "unknown",
          symbol: "BTC-KRW",
          quantity: 0.01,
          avg_entry_price: 100000,
        },
      ]),
      upsert: vi.fn(),
    };

    const ctx: MonitorContext = {
      registry: mockRegistry as any,
      positionRepo: mockPositionRepo as any,
      orderRepo: { create: vi.fn() } as any,
      riskConfig: createRiskConfig() as any,
    };

    const actions = await checkStopLoss(ctx);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toContain("Error checking");
    expect(actions[0]).toContain("Exchange not found");
  });

  it("uses default 5% stop-loss when market type is unknown", async () => {
    const mockExchange = {
      name: "test",
      // Price is exactly at 5% below entry (95000), should trigger
      getPrice: vi.fn().mockResolvedValue({ price: 95000, symbol: "TEST" }),
      placeOrder: vi.fn().mockResolvedValue({ id: "sl-002" }),
    };
    const mockRegistry = { get: vi.fn().mockReturnValue(mockExchange) };
    const mockPositionRepo = {
      listAll: vi.fn().mockReturnValue([
        {
          market_type: "other",
          via: "test",
          symbol: "TEST",
          quantity: 1,
          avg_entry_price: 100000,
        },
      ]),
      upsert: vi.fn(),
    };
    const mockOrderRepo = { create: vi.fn() };

    const ctx: MonitorContext = {
      registry: mockRegistry as any,
      positionRepo: mockPositionRepo as any,
      orderRepo: mockOrderRepo as any,
      riskConfig: createRiskConfig() as any,
    };

    const actions = await checkStopLoss(ctx);

    // 95000 <= 100000 * (1 - 0.05) = 95000, so stop-loss should trigger
    expect(actions).toHaveLength(1);
    expect(actions[0]).toContain("Stop-loss triggered");
  });

  it("handles empty position list", async () => {
    const mockPositionRepo = {
      listAll: vi.fn().mockReturnValue([]),
      upsert: vi.fn(),
    };

    const ctx: MonitorContext = {
      registry: { get: vi.fn() } as any,
      positionRepo: mockPositionRepo as any,
      orderRepo: { create: vi.fn() } as any,
      riskConfig: createRiskConfig() as any,
    };

    const actions = await checkStopLoss(ctx);

    expect(actions).toHaveLength(0);
  });
});
