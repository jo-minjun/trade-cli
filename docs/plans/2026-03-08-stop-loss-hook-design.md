# Stop-Loss Hook Design

## Summary

Add an optional shell script hook that fires (fire-and-forget) when the monitor executes a stop-loss sell. The hook receives trade details as JSON via stdin, allowing users to integrate any external notification (Slack, Discord, SQLite, etc.) without trade-cli needing to know about them.

## Config

```yaml
monitor:
  interval-seconds: 30
  on-stop-loss-hook: ~/.trade-cli/hooks/on-stop-loss.sh  # optional
```

- Set via: `trade config set monitor.on-stop-loss-hook <path>`
- Unset via: `trade config set monitor.on-stop-loss-hook ""`
- No CLI changes needed — existing `config set` supports this out of the box.

## JSON Payload (stdin)

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

## Module Structure

### `src/monitor/hooks.ts` (new)

- `StopLossHookPayload` interface — typed JSON payload
- `executeStopLossHook(hookPath: string, payload: StopLossHookPayload): void`
  - Resolves `~` in path
  - `spawn(hookPath, [], { stdio: ['pipe', 'ignore', 'pipe'], detached: true })`
  - Writes JSON to stdin, calls `child.unref()`
  - Logs errors to stderr, never throws

### `src/monitor/runner.ts` (modified)

- After successful stop-loss sell (filled), if `config.monitor['on-stop-loss-hook']` is set, call `executeStopLossHook()` with the trade payload.
- Hook execution is non-blocking — does not affect the monitor loop.

### `src/config/types.ts` (modified)

- Add `'on-stop-loss-hook'?: string` to `MonitorConfig`.

## Execution Model

- **Fire-and-forget**: `detached: true` + `child.unref()` — parent does not wait.
- **Trigger condition**: Only on filled sell orders. Pending orders do not trigger.
- **Error handling**: `spawn` error and stderr are logged via `console.error`. No retries, no throws.

## Constraints

- `spawn` does not expand `~` — must resolve manually via `os.homedir()`.
- User is responsible for `chmod +x` on the hook script.
- No timeout management — hook process lifetime is outside trade-cli's scope.

## Testing

- `hooks.ts`: Unit test with spawn mock — verify JSON payload correctness, verify no throw on error.
- `runner.ts`: Add test verifying hook is called on filled stop-loss, not called when hook is unset.
