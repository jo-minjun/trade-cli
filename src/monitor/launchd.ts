import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const PLIST_NAME = "com.trade-cli.monitor";
const PLIST_DIR = join(homedir(), "Library/LaunchAgents");

function getPlistPath(): string {
  return join(PLIST_DIR, `${PLIST_NAME}.plist`);
}

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generatePlist(tradePath: string): string {
  const escapedPath = xmlEscape(tradePath);
  const logDir = xmlEscape(join(homedir(), ".trade-cli/logs"));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapedPath}</string>
    <string>monitor</string>
    <string>run</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logDir}/monitor.log</string>
  <key>StandardErrorPath</key>
  <string>${logDir}/monitor.error.log</string>
</dict>
</plist>`;
}

export function installLaunchAgent(tradePath: string): void {
  const plistPath = getPlistPath();
  writeFileSync(plistPath, generatePlist(tradePath));
  execFileSync("launchctl", ["load", plistPath]);
}

export function uninstallLaunchAgent(): void {
  const plistPath = getPlistPath();
  if (existsSync(plistPath)) {
    try {
      execFileSync("launchctl", ["unload", plistPath]);
    } catch {
      // Ignore errors when the agent is not loaded
    }
    unlinkSync(plistPath);
  }
}

function getGuiDomain(): string {
  return `gui/${process.getuid!()}`;
}

export function startLaunchAgent(): void {
  execFileSync("launchctl", ["kickstart", "-k", `${getGuiDomain()}/${PLIST_NAME}`]);
}

export function stopLaunchAgent(): void {
  try {
    execFileSync("launchctl", ["kill", "SIGTERM", `${getGuiDomain()}/${PLIST_NAME}`]);
  } catch {
    // Ignore errors when the agent is not running
  }
}

export function getLaunchAgentStatus(): string {
  try {
    const output = execFileSync(
      "launchctl",
      ["print", `${getGuiDomain()}/${PLIST_NAME}`],
      { encoding: "utf-8" },
    );
    return output.includes("state = running") ? "running" : "stopped";
  } catch {
    return "not installed";
  }
}
