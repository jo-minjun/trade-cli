import { describe, it, expect } from "vitest";
import { getLaunchAgentStatus } from "./launchd.js";

describe("LaunchAgent", () => {
  it("reports not installed when plist does not exist", () => {
    const status = getLaunchAgentStatus();
    // In test environment, the monitor is not installed
    expect(["not installed", "stopped"]).toContain(status);
  });
});
