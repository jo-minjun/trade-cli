import { describe, it, expect, vi } from "vitest";
import { createHistoryCommand } from "./history.js";

describe("history CLI", () => {
  it("creates history command with subcommands", () => {
    const mockOrderRepo = {
      listRecent: vi.fn().mockReturnValue([]),
    } as any;
    const mockPnlRepo = {
      getTodayTotalPnl: vi.fn().mockReturnValue(0),
    } as any;
    const cmd = createHistoryCommand(mockOrderRepo, mockPnlRepo);
    expect(cmd.name()).toBe("history");
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain("list");
    expect(subcommands).toContain("stats");
    expect(subcommands).toContain("export");
  });
});
