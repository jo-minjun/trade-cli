import { describe, it, expect, vi } from "vitest";
import { checkStopLoss } from "./runner.js";
import type { MonitorContext } from "./runner.js";
import type { RiskConfig } from "../config/types.js";
import { executeStopLossHook } from "./hooks.js";
vi.mock("./hooks.js", () => ({
  executeStopLossHook: vi.fn(),
}));
const mockExecuteHook = vi.mocked(executeStopLossHook);

function mockRiskConfig(stopLoss: number): RiskConfig {
  return {
    "max-total-capital": 1000000,
    "max-daily-loss": 50000,
    "max-total-exposure": 0.8,
    "max-order-size": 200000,
    "max-position-ratio": 0.3,
    "circuit-breaker": { "consecutive-losses": 5, "cooldown-minutes": 60 },
    cex: { "max-allocation": 400000, "stop-loss": stopLoss },
    stock: { "max-allocation": 400000, "stop-loss": stopLoss },
    prediction: { "max-allocation": 200000, "stop-loss": stopLoss },
  };
}

function createMockPnlRepo() {
  return { record: vi.fn() };
}

function createMockRiskManager() {
  return { recordLoss: vi.fn(), recordWin: vi.fn() };
}

describe("Stop-loss monitor", () => {
  it("triggers stop-loss when price drops below threshold", async () => {
    const mockExchange = {
      name: "upbit",
      getPrice: vi.fn().mockResolvedValue({ price: 95000, symbol: "BTC-KRW" }),
      placeOrder: vi
        .fn()
        .mockResolvedValue({ id: "sl-001", status: "filled" }),
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
    const mockPnlRepo = createMockPnlRepo();
    const mockRiskManager = createMockRiskManager();

    const ctx: MonitorContext = {
      registry: mockRegistry as any,
      positionRepo: mockPositionRepo as any,
      orderRepo: mockOrderRepo as any,
      pnlRepo: mockPnlRepo as any,
      riskManager: mockRiskManager as any,
      riskConfig: mockRiskConfig(0.05),
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
      pnlRepo: createMockPnlRepo() as any,
      riskManager: createMockRiskManager() as any,
      riskConfig: mockRiskConfig(0.05),
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
      pnlRepo: createMockPnlRepo() as any,
      riskManager: createMockRiskManager() as any,
      riskConfig: mockRiskConfig(0.05),
    };

    const actions = await checkStopLoss(ctx);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toContain("Error checking");
    expect(actions[0]).toContain("Exchange not found");
  });

  it("uses default stop-loss percent from config", async () => {
    const mockExchange = {
      name: "test",
      // Price is exactly at 5% below entry (95000), should trigger
      getPrice: vi.fn().mockResolvedValue({ price: 95000, symbol: "TEST" }),
      placeOrder: vi
        .fn()
        .mockResolvedValue({ id: "sl-002", status: "filled" }),
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
      pnlRepo: createMockPnlRepo() as any,
      riskManager: createMockRiskManager() as any,
      riskConfig: mockRiskConfig(0.05),
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
      pnlRepo: createMockPnlRepo() as any,
      riskManager: createMockRiskManager() as any,
      riskConfig: mockRiskConfig(0.05),
    };

    const actions = await checkStopLoss(ctx);

    expect(actions).toHaveLength(0);
  });

  it("records PnL after stop-loss execution", async () => {
    const mockExchange = {
      name: "upbit",
      getPrice: vi.fn().mockResolvedValue({ price: 89000, symbol: "BTC-KRW" }),
      placeOrder: vi
        .fn()
        .mockResolvedValue({ id: "sl-pnl-001", status: "filled" }),
    };
    const mockRegistry = { get: vi.fn().mockReturnValue(mockExchange) };
    const mockPositionRepo = {
      listAll: vi.fn().mockReturnValue([
        {
          market_type: "cex",
          via: "upbit",
          symbol: "BTC-KRW",
          quantity: 0.5,
          avg_entry_price: 100000,
        },
      ]),
      upsert: vi.fn(),
    };
    const mockOrderRepo = { create: vi.fn() };
    const mockPnlRepo = createMockPnlRepo();
    const mockRiskManager = createMockRiskManager();

    const ctx: MonitorContext = {
      registry: mockRegistry as any,
      positionRepo: mockPositionRepo as any,
      orderRepo: mockOrderRepo as any,
      pnlRepo: mockPnlRepo as any,
      riskManager: mockRiskManager as any,
      riskConfig: mockRiskConfig(0.1),
    };

    await checkStopLoss(ctx);

    // stopPrice = 100000 * (1 - 0.1) = 90000, price 89000 <= 90000 triggers
    // PnL = (89000 - 100000) * 0.5 = -5500
    const expectedPnl = (89000 - 100000) * 0.5;
    const today = new Date().toISOString().split("T")[0];
    expect(mockPnlRepo.record).toHaveBeenCalledWith(
      today,
      "cex",
      "upbit",
      expectedPnl,
      false,
    );
    expect(mockRiskManager.recordLoss).toHaveBeenCalledOnce();
  });

  it("does not delete position when order is pending", async () => {
    const mockExchange = {
      name: "upbit",
      getPrice: vi.fn().mockResolvedValue({ price: 90000, symbol: "BTC-KRW" }),
      placeOrder: vi
        .fn()
        .mockResolvedValue({ id: "sl-pending-001", status: "pending" }),
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
    const mockOrderRepo = { create: vi.fn() };
    const mockPnlRepo = createMockPnlRepo();
    const mockRiskManager = createMockRiskManager();

    const ctx: MonitorContext = {
      registry: mockRegistry as any,
      positionRepo: mockPositionRepo as any,
      orderRepo: mockOrderRepo as any,
      pnlRepo: mockPnlRepo as any,
      riskManager: mockRiskManager as any,
      riskConfig: mockRiskConfig(0.05),
    };

    const actions = await checkStopLoss(ctx);

    // Order was placed but is pending
    expect(mockExchange.placeOrder).toHaveBeenCalled();
    expect(mockOrderRepo.create).toHaveBeenCalled();

    // Position should NOT be zeroed out (only 1 upsert for price update)
    expect(mockPositionRepo.upsert).toHaveBeenCalledTimes(1);

    // PnL should NOT be recorded
    expect(mockPnlRepo.record).not.toHaveBeenCalled();
    expect(mockRiskManager.recordLoss).not.toHaveBeenCalled();

    // Action message should indicate pending
    expect(actions).toHaveLength(1);
    expect(actions[0]).toContain("pending");
    expect(actions[0]).toContain("sl-pending-001");
  });

  function createHookTestCtx(
    orderResult: { id: string; status: string; filledPrice?: number; filledAmount?: number },
    overrides: Partial<MonitorContext> = {},
  ): MonitorContext {
    const mockExchange = {
      name: "upbit",
      getPrice: vi.fn().mockResolvedValue({ price: 90000, symbol: "BTC-KRW" }),
      placeOrder: vi.fn().mockResolvedValue(orderResult),
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

    return {
      registry: mockRegistry as any,
      positionRepo: mockPositionRepo as any,
      orderRepo: { create: vi.fn() } as any,
      pnlRepo: createMockPnlRepo() as any,
      riskManager: createMockRiskManager() as any,
      riskConfig: mockRiskConfig(0.05),
      ...overrides,
    };
  }

  it("calls stop-loss hook when configured and order is filled", async () => {
    mockExecuteHook.mockClear();
    const ctx = createHookTestCtx(
      { id: "sl-hook-001", status: "filled", filledPrice: 90000, filledAmount: 0.01 },
      { onStopLossHook: "~/hooks/on-stop-loss.sh" },
    );

    await checkStopLoss(ctx);

    expect(mockExecuteHook).toHaveBeenCalledOnce();
    expect(mockExecuteHook).toHaveBeenCalledWith(
      "~/hooks/on-stop-loss.sh",
      expect.objectContaining({
        event: "stop-loss",
        symbol: "BTC-KRW",
        market_type: "cex",
        side: "sell",
        order_id: "sl-hook-001",
      }),
    );
  });

  it("does not call hook when on-stop-loss-hook is not configured", async () => {
    mockExecuteHook.mockClear();
    const ctx = createHookTestCtx({ id: "sl-no-hook", status: "filled" });

    await checkStopLoss(ctx);

    expect(mockExecuteHook).not.toHaveBeenCalled();
  });

  it("does not call hook when order is pending", async () => {
    mockExecuteHook.mockClear();
    const ctx = createHookTestCtx(
      { id: "sl-pending", status: "pending" },
      { onStopLossHook: "~/hooks/on-stop-loss.sh" },
    );

    await checkStopLoss(ctx);

    expect(mockExecuteHook).not.toHaveBeenCalled();
  });
});
