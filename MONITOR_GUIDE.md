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
5. **If filled:** record realized PnL and notify the risk manager (may activate circuit breaker)

Individual position errors (e.g., exchange timeout) are logged but do not stop the monitor from checking other positions.

> **Platform:** macOS only. The daemon uses `launchctl` and installs a plist at `~/Library/LaunchAgents/com.trade-cli.monitor.plist`.
