import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const PLIST_NAME = "com.trade-cli.monitor";
const PLIST_DIR = join(homedir(), "Library/LaunchAgents");

function getPlistPath(): string {
  return join(PLIST_DIR, `${PLIST_NAME}.plist`);
}

function generatePlist(tradePath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${tradePath}</string>
    <string>monitor</string>
    <string>run</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(homedir(), ".trade-cli/logs/monitor.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(homedir(), ".trade-cli/logs/monitor.error.log")}</string>
</dict>
</plist>`;
}

export function installLaunchAgent(tradePath: string): void {
  const plistPath = getPlistPath();
  writeFileSync(plistPath, generatePlist(tradePath));
  execSync(`launchctl load ${plistPath}`);
}

export function uninstallLaunchAgent(): void {
  const plistPath = getPlistPath();
  if (existsSync(plistPath)) {
    try {
      execSync(`launchctl unload ${plistPath}`);
    } catch {
      // Ignore errors when the agent is not loaded
    }
    unlinkSync(plistPath);
  }
}

export function startLaunchAgent(): void {
  execSync(`launchctl kickstart -k gui/$(id -u)/${PLIST_NAME}`);
}

export function stopLaunchAgent(): void {
  try {
    execSync(`launchctl kill SIGTERM gui/$(id -u)/${PLIST_NAME}`);
  } catch {
    // Ignore errors when the agent is not running
  }
}

export function getLaunchAgentStatus(): string {
  try {
    const output = execSync(
      `launchctl print gui/$(id -u)/${PLIST_NAME} 2>&1`,
      { encoding: "utf-8" },
    );
    return output.includes("state = running") ? "running" : "stopped";
  } catch {
    return "not installed";
  }
}
