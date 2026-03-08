import { describe, it, expect, vi } from "vitest";
import { createPositionCommand } from "./position.js";

describe("position CLI", () => {
  it("creates position command with summary subcommand", () => {
    const mockPosRepo = {
      listAll: vi.fn().mockReturnValue([]),
      totalExposure: vi.fn().mockReturnValue(0),
    } as any;
    const cmd = createPositionCommand(mockPosRepo);
    expect(cmd.name()).toBe("position");
    expect(cmd.commands.map((c) => c.name())).toContain("summary");
  });
});
