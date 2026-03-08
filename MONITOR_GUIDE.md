# Stop-Loss Monitor Guide

The stop-loss monitor is a background daemon that automatically sells positions when prices drop below configured thresholds. It runs as a macOS LaunchAgent, checking positions at a regular interval and executing market sell orders when stop-loss conditions are met.

## Quick Start

```bash
# Install and start the daemon
./trade monitor install

# Check daemon status
./trade monitor status

# View logs
tail -f ~/.trade-cli/logs/monitor.log
```

## Configuration

### Stop-Loss Thresholds

Each market type has an independent stop-loss percentage. When a position's price drops below `entry_price × (1 - stop-loss%)`, a market sell order is placed.

| Market | Default | Config Key | Example |
|--------|---------|------------|---------|
| CEX | 5% | `risk.cex.stop-loss` | Entry 100,000 → sells at ≤ 95,000 |
| Stock | 3% | `risk.stock.stop-loss` | Entry 50,000 → sells at ≤ 48,500 |
| Prediction | 10% | `risk.prediction.stop-loss` | Entry 0.80 → sells at ≤ 0.72 |

```bash
# Adjust stop-loss for CEX to 3%
./trade config set risk.cex.stop-loss 0.03
```

### Polling Interval

The monitor checks positions at a configurable interval (default: 30 seconds).

```bash
# Check every 60 seconds
./trade config set monitor.interval-seconds 60
```

The corresponding `config.yaml` section:

```yaml
monitor:
  interval-seconds: 60
```

> **Note:** Changes to the config require restarting the daemon to take effect.

```bash
./trade monitor stop
./trade monitor start
```

### Stop-Loss Hook

You can configure an optional executable that runs whenever a stop-loss sell is executed. The script receives trade details as JSON via stdin, so you can integrate any notification system (Slack, Discord, etc.). Any language works (bash, python, node, etc.) as long as the file has a shebang and execute permission.

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

**Example hook scripts:**

Bash:

```bash
#!/bin/bash
# ~/.trade-cli/hooks/on-stop-loss.sh

read -r payload
symbol=$(echo "$payload" | jq -r '.symbol')
pnl=$(echo "$payload" | jq -r '.realized_pnl')
price=$(echo "$payload" | jq -r '.execution_price')

curl -s -X POST "$SLACK_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"text\": \"🔻 Stop-loss triggered: ${symbol} sold at ${price} (PnL: ${pnl})\"}"
```

Python:

```python
#!/usr/bin/env python3
# ~/.trade-cli/hooks/on-stop-loss.py

import json, sys, urllib.request

payload = json.load(sys.stdin)
message = f"🔻 Stop-loss: {payload['symbol']} sold at {payload['execution_price']} (PnL: {payload['realized_pnl']})"
req = urllib.request.Request(
    os.environ["SLACK_WEBHOOK_URL"],
    data=json.dumps({"text": message}).encode(),
    headers={"Content-Type": "application/json"},
)
urllib.request.urlopen(req)
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

> **Note:** The hook runs asynchronously (fire-and-forget). Failures do not affect the monitor. Make sure the file has a shebang (e.g. `#!/bin/bash`, `#!/usr/bin/env python3`) and is executable (`chmod +x`).

## Commands

| Command | Description |
|---------|-------------|
| `monitor install` | Install and start the LaunchAgent daemon |
| `monitor uninstall` | Stop and remove the daemon |
| `monitor start` | Start the daemon |
| `monitor stop` | Stop the daemon |
| `monitor status` | Check daemon status (running / stopped / not installed) |

## Logs

The daemon writes logs to `~/.trade-cli/logs/`:

| File | Content |
|------|---------|
| `monitor.log` | Normal output — stop-loss triggers, price updates |
| `monitor.error.log` | Errors — exchange failures, connection issues |

```bash
# Follow live logs
tail -f ~/.trade-cli/logs/monitor.log

# Search for stop-loss events
grep "Stop-loss triggered" ~/.trade-cli/logs/monitor.log
```

## How It Works

Each check cycle runs the following steps for every open position:

1. **Fetch current price** from the exchange
2. **Update position** with latest price and unrealized PnL
3. **Compare** current price against stop-loss threshold (`entry_price × (1 - stop-loss%)`)
4. **If triggered:** place a market sell order for the full position
5. **If filled:** record realized PnL, notify the risk manager (may activate circuit breaker), and run the stop-loss hook if configured

Individual position errors (e.g., exchange timeout) are logged but do not stop the monitor from checking other positions.

> **Platform:** macOS only. The daemon uses `launchctl` and installs a plist at `~/Library/LaunchAgents/com.trade-cli.monitor.plist`.
