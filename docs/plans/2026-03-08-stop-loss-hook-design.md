# Stop-Loss Hook Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a fire-and-forget shell script hook that executes when the monitor triggers a stop-loss sell, passing trade details as JSON via stdin.

**Architecture:** New `src/monitor/hooks.ts` module handles hook execution (spawn, JSON pipe, error logging). `runner.ts` calls it after a filled stop-loss sell. Config adds optional `on-stop-loss-hook` to `MonitorConfig`.

**Tech Stack:** Node.js `child_process.spawn`, vitest for testing.

---

## Design

### Config

```yaml
monitor:
  interval-seconds: 30
  on-stop-loss-hook: ~/.trade-cli/hooks/on-stop-loss.sh  # optional
```

- Set via: `trade config set monitor.on-stop-loss-hook <path>`
- Unset via: `trade config set monitor.on-stop-loss-hook ""`

### JSON Payload (stdin)

```json
{
  "event": "stop-loss",
  "timestamp": "2026-03-08T10:30:00.000Z",
  "symbol": "BTC/KRW",
  "market_type": "cex",
  "side": "sell",
  "quantity": 0.1,
  "entry_price": 50000000,
  "stop_price": 47500000,
  "execution_price": 47480000,
  "realized_pnl": -252000,
  "order_id": "uuid-..."
}
```

---

## Task 1: Add `on-stop-loss-hook` to config types

**Files:**
- Modify: `src/config/types.ts:42-44`

**Step 1: Add optional field to MonitorConfig**

In `src/config/types.ts`, change:

```typescript
export interface MonitorConfig {
  "interval-seconds": number;
}
```

to:

```typescript
export interface MonitorConfig {
  "interval-seconds": number;
  "on-stop-loss-hook"?: string;
}
```

No changes needed in `src/config/defaults.ts` — the field is optional and `deepMerge` handles undefined.

**Step 2: Verify build**

Run: `pnpm build`
Expected: SUCCESS, no type errors.

**Step 3: Commit**

```bash
git add src/config/types.ts
git commit -m "feat: add on-stop-loss-hook to MonitorConfig type"
```

---

## Task 2: Create `src/monitor/hooks.ts` with tests (TDD)

**Files:**
- Create: `src/monitor/hooks.ts`
- Create: `src/monitor/hooks.test.ts`

**Step 1: Write failing tests**

Create `src/monitor/hooks.test.ts`:

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/monitor/hooks.test.ts`
Expected: FAIL — `hooks.js` does not exist.

**Step 3: Write minimal implementation**

Create `src/monitor/hooks.ts`:

```typescript
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
  child.unref();
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/monitor/hooks.test.ts`
Expected: ALL PASS (3 tests).

**Step 5: Commit**

```bash
git add src/monitor/hooks.ts src/monitor/hooks.test.ts
git commit -m "feat: add stop-loss hook executor module with tests"
```

---

## Task 3: Integrate hook into `runner.ts` with tests (TDD)

**Files:**
- Modify: `src/monitor/runner.ts:1-20,62-86`
- Modify: `src/monitor/runner.test.ts`

**Step 1: Add hook test to runner.test.ts**

Append to the `describe` block in `src/monitor/runner.test.ts`:

```typescript
// Add import at top:
import { executeStopLossHook } from "./hooks.js";
vi.mock("./hooks.js", () => ({
  executeStopLossHook: vi.fn(),
}));
const mockExecuteHook = vi.mocked(executeStopLossHook);

// Add these tests inside the describe block:

it("calls stop-loss hook when configured and order is filled", async () => {
  mockExecuteHook.mockClear();
  const mockExchange = {
    name: "upbit",
    getPrice: vi.fn().mockResolvedValue({ price: 90000, symbol: "BTC-KRW" }),
    placeOrder: vi
      .fn()
      .mockResolvedValue({ id: "sl-hook-001", status: "filled", filledPrice: 90000, filledAmount: 0.01 }),
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
    onStopLossHook: "~/hooks/on-stop-loss.sh",
  };

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
  const mockExchange = {
    name: "upbit",
    getPrice: vi.fn().mockResolvedValue({ price: 90000, symbol: "BTC-KRW" }),
    placeOrder: vi
      .fn()
      .mockResolvedValue({ id: "sl-no-hook", status: "filled" }),
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
    // no onStopLossHook
  };

  await checkStopLoss(ctx);

  expect(mockExecuteHook).not.toHaveBeenCalled();
});

it("does not call hook when order is pending", async () => {
  mockExecuteHook.mockClear();
  const mockExchange = {
    name: "upbit",
    getPrice: vi.fn().mockResolvedValue({ price: 90000, symbol: "BTC-KRW" }),
    placeOrder: vi
      .fn()
      .mockResolvedValue({ id: "sl-pending", status: "pending" }),
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
    onStopLossHook: "~/hooks/on-stop-loss.sh",
  };

  await checkStopLoss(ctx);

  expect(mockExecuteHook).not.toHaveBeenCalled();
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/monitor/runner.test.ts`
Expected: FAIL — `onStopLossHook` not in `MonitorContext`, `executeStopLossHook` never called.

**Step 3: Modify runner.ts**

In `src/monitor/runner.ts`:

a) Add import at top:
```typescript
import { executeStopLossHook } from "./hooks.js";
import type { StopLossHookPayload } from "./hooks.js";
```

b) Add `onStopLossHook` to `MonitorContext`:
```typescript
export interface MonitorContext {
  registry: ExchangeRegistry;
  positionRepo: PositionRepository;
  orderRepo: OrderRepository;
  pnlRepo: DailyPnlRepository;
  riskManager: RiskManager;
  riskConfig: RiskConfig;
  intervalMs?: number;
  onStopLossHook?: string;
}
```

c) After the filled branch (after `actions.push(...)` on line 79-81), add hook call:

```typescript
if (ctx.onStopLossHook) {
  const hookPayload: StopLossHookPayload = {
    event: "stop-loss",
    timestamp: new Date().toISOString(),
    symbol: pos.symbol,
    market_type: pos.market_type,
    side: "sell",
    quantity: soldQty,
    entry_price: pos.avg_entry_price,
    stop_price: stopPrice,
    execution_price: sellPrice,
    realized_pnl: pnl,
    order_id: order.id,
  };
  executeStopLossHook(ctx.onStopLossHook, hookPayload);
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/monitor/runner.test.ts`
Expected: ALL PASS (including 3 new hook tests + 7 existing).

**Step 5: Commit**

```bash
git add src/monitor/runner.ts src/monitor/runner.test.ts
git commit -m "feat: integrate stop-loss hook into monitor runner"
```

---

## Task 4: Wire config to runner in `commands/monitor.ts`

**Files:**
- Modify: `src/commands/monitor.ts` (the `monitor run` command handler)

**Step 1: Read the monitor run command to find where MonitorContext is constructed**

Look for where `startMonitor(ctx)` is called and `ctx` is built.

**Step 2: Add `onStopLossHook` from config**

Where `MonitorContext` is constructed, add:

```typescript
onStopLossHook: config.monitor["on-stop-loss-hook"] || undefined,
```

Ensure empty string `""` is treated as unset (falsy → `undefined`).

**Step 3: Verify build**

Run: `pnpm build`
Expected: SUCCESS.

**Step 4: Run all monitor tests**

Run: `pnpm vitest run src/monitor/`
Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/commands/monitor.ts
git commit -m "feat: wire on-stop-loss-hook config to monitor runner"
```

---

## Task 5: Update MONITOR_GUIDE.md

**Files:**
- Modify: `MONITOR_GUIDE.md`

**Step 1: Add Hook section after the "Polling Interval" section**

Insert a new "Stop-Loss Hook" section in the Configuration area, after the polling interval block (after line 56 of current file). Content:

```markdown
### Stop-Loss Hook

You can configure an optional shell script that runs whenever a stop-loss sell is executed. The script receives trade details as JSON via stdin, so you can integrate any notification system (Slack, Discord, etc.).

```bash
# Set the hook script path
./trade config set monitor.on-stop-loss-hook ~/.trade-cli/hooks/on-stop-loss.sh
```

The corresponding `config.yaml` section:

```yaml
monitor:
  interval-seconds: 30
  on-stop-loss-hook: ~/.trade-cli/hooks/on-stop-loss.sh
```

**Example hook script:**

```bash
#!/bin/bash
# ~/.trade-cli/hooks/on-stop-loss.sh
# Reads JSON from stdin and sends a Slack notification

read -r payload
symbol=$(echo "$payload" | jq -r '.symbol')
pnl=$(echo "$payload" | jq -r '.realized_pnl')
price=$(echo "$payload" | jq -r '.execution_price')

curl -s -X POST "$SLACK_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"text\": \"🔻 Stop-loss triggered: ${symbol} sold at ${price} (PnL: ${pnl})\"}"
```

**JSON payload fields:**

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | Always `"stop-loss"` |
| `timestamp` | string | ISO 8601 timestamp |
| `symbol` | string | Trading pair (e.g. `BTC-KRW`) |
| `market_type` | string | `cex`, `stock`, or `prediction` |
| `side` | string | Always `"sell"` |
| `quantity` | number | Quantity sold |
| `entry_price` | number | Average entry price |
| `stop_price` | number | Stop-loss threshold price |
| `execution_price` | number | Actual sell price |
| `realized_pnl` | number | Realized profit/loss |
| `order_id` | string | Exchange order ID |

> **Note:** The hook runs asynchronously (fire-and-forget). Failures do not affect the monitor. Make sure the script is executable (`chmod +x`).
```

**Step 2: Also update the "How It Works" section**

Update step 5 to mention the hook:

Change:
```
5. **If filled:** record realized PnL and notify the risk manager (may activate circuit breaker)
```
To:
```
5. **If filled:** record realized PnL, notify the risk manager (may activate circuit breaker), and run the stop-loss hook if configured
```

**Step 3: Commit**

```bash
git add MONITOR_GUIDE.md
git commit -m "docs: add stop-loss hook section to monitor guide"
```

---

## Task 6: Final verification and squash

**Step 1: Run full test suite**

Run: `pnpm vitest run`
Expected: ALL PASS.

**Step 2: Run build**

Run: `pnpm build`
Expected: SUCCESS.

**Step 3: Squash commits into one**

Squash the 5 task commits into a single commit:

```bash
git rebase -r HEAD~5
# squash into: "feat: add stop-loss hook for monitor"
```

---

## Summary of changes

| File | Action | What |
|------|--------|------|
| `src/config/types.ts` | Modify | Add `on-stop-loss-hook?` to `MonitorConfig` |
| `src/monitor/hooks.ts` | Create | `StopLossHookPayload` interface + `executeStopLossHook()` |
| `src/monitor/hooks.test.ts` | Create | 3 tests: spawn+pipe, tilde resolve, error handling |
| `src/monitor/runner.ts` | Modify | Add `onStopLossHook` to context, call hook on filled sell |
| `src/monitor/runner.test.ts` | Modify | 3 new tests: hook called, not called when unset, not called when pending |
| `src/commands/monitor.ts` | Modify | Pass config hook path to MonitorContext |
| `MONITOR_GUIDE.md` | Modify | Add hook configuration section and JSON payload docs |
