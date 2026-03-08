import { spawn } from "node:child_process";
import { homedir } from "node:os";

export interface StopLossHookPayload {
  event: "stop-loss";
  timestamp: string;
  symbol: string;
  market_type: string;
  side: "sell";
  quantity: number;
  entry_price: number;
  stop_price: number;
  execution_price: number;
  realized_pnl: number;
  order_id: string;
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) {
    return p.replace("~", homedir());
  }
  return p;
}

export function executeStopLossHook(
  hookPath: string,
  payload: StopLossHookPayload,
): void {
  const resolved = resolvePath(hookPath);
  const child = spawn(resolved, [], {
    stdio: ["pipe", "ignore", "pipe"],
    detached: true,
  });
  child.stdin!.write(JSON.stringify(payload));
  child.stdin!.end();
  child.on("error", (err) =>
    console.error(`[hook] failed to execute: ${err.message}`),
  );
  child.stderr!.on("data", (data: Buffer) =>
    console.error(`[hook] stderr: ${data}`),
  );
  // unref after all event listeners are registered
  child.unref();
}
