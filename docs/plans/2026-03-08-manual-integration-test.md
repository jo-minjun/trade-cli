# Manual Integration Test Plan

## Goal

Verify all CLI commands work correctly through manual execution, starting from a fresh setup.

## Test Order

### Step 1: Basic CLI & Config (no API key required)

- CLI help and version
- `config init` — create default config file
- `config show` — display current config
- `config set` — modify config values

### Step 2: DB & Internal Features (no API key required)

- `risk status` — view risk status
- `risk check` — test risk check logic
- `risk set` / `risk reset-circuit-breaker`
- `position summary`
- `history list` / `history stats` / `history export`

### Step 3: Upbit Read-Only (API key required for most)

- `cex price` — get ticker price
- `cex orderbook` — get order book
- `cex candles` — get candle data

### Step 4: Upbit Trading (API key required)

- `cex balance` — check account balance
- `cex buy` — place buy order
- `cex sell` — place sell order
- `cex cancel` — cancel order

### Step 5: Monitor

- `monitor install` — install LaunchAgent
- `monitor status` — check daemon status
- `monitor start` / `monitor stop`
- `monitor uninstall` — remove LaunchAgent

## Fix List (found during testing)

### Bug: Upbit toMarket() symbol conversion is broken

- **Severity:** Critical
- **Root cause:** `toMarket()` in `src/exchanges/upbit/client.ts:150-157` checks if `parts[1]` is a quote currency (KRW/BTC/USDT) and swaps. But Upbit's native format IS `KRW-BTC`, so inputting `KRW-BTC` causes `parts[1]="BTC"` → swaps to `BTC-KRW` → 404. The function cannot distinguish between "already Upbit format" and "needs conversion".
- **Fix:** Check if `parts[0]` is the quote currency instead. Upbit format always has quote first (KRW-BTC, BTC-ETH). If `parts[0]` is KRW/BTC/USDT, it's already Upbit format → return as-is. If `parts[1]` is KRW/BTC/USDT, swap.
- **Files:** `src/exchanges/upbit/client.ts`
- **Re-test:** `./trade cex price KRW-BTC` should work. `./trade cex price BTC-KRW` should also work (by converting).

### Bug: Market order status stays "pending", position/PnL never recorded

- **Severity:** Critical
- **Root cause:** Upbit API returns `state: "wait"` for market orders at response time (order is queued). `mapStatus("wait")` → `"pending"`. Then `updatePositionAfterOrder()` at `src/commands/helpers.ts:27` returns early because `status !== "filled"`. The order is actually filled milliseconds later but we never re-check.
- **Fix:** After `placeOrder()`, poll `getOrder(orderId)` with a short delay (e.g., retry 3 times with 500ms interval) until status is `"done"`. Use the polled result for `updatePositionAfterOrder()` and update `orderRepo` status accordingly. Apply polling to ALL order types, not just market orders (limit orders can also fill immediately).
- **Additional root cause:** Upbit market buy (`ord_type: "price"`) returns `state: "cancel"` when fully filled. `mapStatus` mapped this to `"cancelled"`. Fixed to treat as `"filled"` when `executed_volume > 0`. Also `filledPrice` was always `null` — now calculated from `trades` array.
- **Files:** `src/commands/helpers.ts`, `src/commands/cex.ts`, `src/exchanges/upbit/client.ts`
- **Re-test:** `./trade cex buy BTC-KRW 5000` → `./trade position summary` should show BTC position. `./trade history list` should show status `filled`.

### Bug: Monitor daemon crashes — node not in launchd PATH

- **Severity:** Critical
- **Root cause:** `trade` script uses `#!/usr/bin/env -S node --import tsx`. LaunchAgent runs without user's shell profile, so `node` is not in PATH. Error log: `env: node: No such file or directory`.
- **Fix:** In `generatePlist()` at `src/monitor/launchd.ts:21-44`, resolve the absolute path to `node` at install time (e.g., `which node`) and use it in ProgramArguments instead of relying on the `trade` shebang. Or add an `EnvironmentVariables` section with PATH.
- **Files:** `src/monitor/launchd.ts`
- **Re-test:** `./trade monitor install` → `./trade monitor status` should show "running". Check `~/.trade-cli/logs/monitor.error.log` is empty.

### Bug: config set accepts arbitrary keys without validation

- **Severity:** Major
- **Root cause:** `setNestedValue()` in `src/commands/config.ts:35-59` creates any nested path without checking against the known schema. `config set exchanges.upbit.access-key X` silently writes to a path that `index.ts` never reads (it reads `cex.upbit.api-key`).
- **Fix:** Validate the top-level key against `TradeConfig` known keys (`cex`, `stock`, `prediction`, `risk`). Reject or warn on unknown paths.
- **Files:** `src/commands/config.ts`
- **Re-test:** `./trade config set exchanges.upbit.access-key X` should print an error. `./trade config set cex.upbit.api-key X` should succeed.

### Enhancement: --via default should read from config

- **Severity:** Minor
- **Root cause:** All command options have `--via` default hardcoded: `"upbit"` in cex.ts, likely `"kis"` in stock.ts, `"polymarket"` in prediction.ts. The `config.cex.default-via` value is never used.
- **Fix:** Pass config to command factory functions, read `config.cex["default-via"]` as the default value for `--via`.
- **Files:** `src/commands/cex.ts`, `src/commands/stock.ts`, `src/commands/prediction.ts`, `src/index.ts`
- **Re-test:** Change `default-via` in config → run command without `--via` → should use config value.

### Enhancement: monitor status leaks stderr

- **Severity:** Minor
- **Root cause:** `getLaunchAgentStatus()` in `src/monitor/launchd.ts:80-91` calls `execFileSync` without suppressing stderr. When service doesn't exist, `launchctl print` writes "Bad request" / "Could not find service" to stderr before the catch block handles it.
- **Fix:** Add `{ stdio: ['pipe', 'pipe', 'pipe'] }` to `execFileSync` options.
- **Files:** `src/monitor/launchd.ts`
- **Re-test:** `./trade monitor status` (when not installed) should only show "Monitor daemon: not installed" with no extra output.

### Enhancement: Add open orders command

- **Severity:** Minor
- **Root cause:** `getOpenOrders()` is implemented in Upbit client but no CLI command exposes it.
- **Fix:** Add `cex orders` subcommand that calls `exchange.getOpenOrders()`.
- **Files:** `src/commands/cex.ts`
- **Re-test:** `./trade cex orders` should list open orders (or "No open orders").

## Re-test Checklist (after fixes)

Run in order. Each item must pass before proceeding.

1. **toMarket fix:**
   - `./trade cex price KRW-BTC` → shows price (no 404)
   - `./trade cex price BTC-KRW` → also works (converted)
   - `./trade cex orderbook KRW-BTC` → shows orderbook
2. **Order status polling fix:**
   - `./trade cex buy KRW-BTC 5000` → order placed
   - `./trade history list` → status shows "filled" (not "pending")
   - `./trade position summary` → shows BTC position with correct quantity
   - `./trade cex sell KRW-BTC <quantity>` → order placed
   - `./trade position summary` → position removed or reduced
   - `./trade history stats` → shows PnL data
3. **Monitor fix:**
   - `./trade monitor install` → installed and started
   - `./trade monitor status` → "running" (no stderr leak)
   - Wait 30s → check `~/.trade-cli/logs/monitor.log` has output
   - `./trade monitor stop` → stopped
   - `./trade monitor uninstall` → removed
4. **Config validation fix:**
   - `./trade config set exchanges.upbit.key X` → error
   - `./trade config set cex.upbit.api-key X` → success
5. **--via default fix:**
   - `./trade config set cex.default-via upbit`
   - `./trade cex price KRW-BTC` (without --via) → works
6. **Open orders command:**
   - `./trade cex orders` → "No open orders" or list

## Out of Scope

- KIS (stock) — not testing in this session
- Polymarket (prediction) — order execution not implemented
