import { describe, it, expect, vi } from "vitest";
import { createRiskCommand } from "./risk.js";

describe("risk CLI", () => {
  it("creates risk command with subcommands", () => {
    const mockRisk = {
      check: vi.fn().mockReturnValue({ approved: true }),
      status: vi.fn().mockReturnValue({
        circuitBreaker: false,
        consecutiveLosses: 0,
        circuitBreakerUntil: null,
      }),
      resetCircuitBreaker: vi.fn(),
    } as any;
    const cmd = createRiskCommand(mockRisk);
    expect(cmd.name()).toBe("risk");
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain("check");
    expect(subcommands).toContain("status");
    expect(subcommands).toContain("set");
    expect(subcommands).toContain("reset-circuit-breaker");
  });
});
