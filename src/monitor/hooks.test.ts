import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { executeStopLossHook, type StopLossHookPayload } from "./hooks.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

function createMockChild(): Partial<ChildProcess> {
  return {
    stdin: { write: vi.fn(), end: vi.fn() } as any,
    stderr: { on: vi.fn() } as any,
    on: vi.fn(),
    unref: vi.fn(),
  };
}

function samplePayload(): StopLossHookPayload {
  return {
    event: "stop-loss",
    timestamp: "2026-03-08T10:30:00.000Z",
    symbol: "BTC-KRW",
    market_type: "cex",
    side: "sell",
    quantity: 0.1,
    entry_price: 100000,
    stop_price: 95000,
    execution_price: 94500,
    realized_pnl: -550,
    order_id: "sl-001",
  };
}

describe("executeStopLossHook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("spawns the hook script and pipes JSON to stdin", () => {
    const mockChild = createMockChild();
    mockSpawn.mockReturnValue(mockChild as any);
    const payload = samplePayload();

    executeStopLossHook("/path/to/hook.sh", payload);

    expect(mockSpawn).toHaveBeenCalledWith("/path/to/hook.sh", [], {
      stdio: ["pipe", "ignore", "pipe"],
      detached: true,
    });
    expect(mockChild.stdin!.write).toHaveBeenCalledWith(
      JSON.stringify(payload),
    );
    expect(mockChild.stdin!.end).toHaveBeenCalled();
    expect(mockChild.unref).toHaveBeenCalled();
  });

  it("resolves ~ in hook path", () => {
    const mockChild = createMockChild();
    mockSpawn.mockReturnValue(mockChild as any);

    executeStopLossHook("~/hooks/on-stop-loss.sh", samplePayload());

    const calledPath = mockSpawn.mock.calls[0][0] as string;
    expect(calledPath).not.toContain("~");
    expect(calledPath).toMatch(/\/hooks\/on-stop-loss\.sh$/);
  });

  it("does not throw when spawn emits an error", () => {
    const mockChild = createMockChild();
    mockSpawn.mockReturnValue(mockChild as any);
    const onFn = mockChild.on as ReturnType<typeof vi.fn>;

    executeStopLossHook("/path/to/hook.sh", samplePayload());

    // Simulate spawn error
    const errorHandler = onFn.mock.calls.find(
      (c: any[]) => c[0] === "error",
    )?.[1];
    expect(errorHandler).toBeDefined();
    expect(() => errorHandler(new Error("ENOENT"))).not.toThrow();
  });
});
