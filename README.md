# trade-cli

A lightweight trading CLI tool designed to work with OpenClaw AI agents.

AI handles market analysis and strategy decisions, while trade-cli handles order execution and risk management.

## Supported Markets

| Market | Exchange/Broker | Status |
|--------|----------------|--------|
| Crypto (CEX) | Upbit | Tested |
| Stocks | Korea Investment & Securities (KIS) | WIP |
| Prediction Markets | Polymarket | WIP |

## Installation

Requires Node.js 24+ and pnpm.

```bash
git clone <repo-url>
cd trade-cli
pnpm install
chmod +x trade
```

## Usage

```bash
# Initial setup
./trade config init

# Price quotes
./trade cex price KRW-BTC
./trade stock price 005930

# Orders
./trade cex buy KRW-BTC 10000
./trade stock buy 005930 100000

# Risk check
./trade risk status
./trade risk check cex KRW-BTC 50000

# Portfolio
./trade position summary
./trade history stats
```

## Guides

- [CEX (Crypto Exchange) Guide](CEX_GUIDE.md) — Upbit setup, market data, trading

## Risk Management

All buy orders must pass a 6-step risk check before execution. Sell orders bypass risk checks. AI agents cannot bypass risk limits.

| Step | Check | Default | Config Key |
|------|-------|---------|------------|
| 1 | Circuit breaker (consecutive losses) | 5 losses, 60 min cooldown | `circuit-breaker.consecutive-losses` |
| 2 | Max single order size | 200,000 KRW | `max-order-size` |
| 3 | Daily loss limit (including potential stop-loss) | 50,000 KRW | `max-daily-loss` |
| 4 | Market allocation limit | CEX 400K, Stock 400K, Prediction 200K | `risk.cex.max-allocation` etc. |
| 5 | Total exposure ratio | 80% of total capital | `max-total-exposure` |
| 6 | Single position ratio | 30% of total capital | `max-position-ratio` |

```bash
./trade risk status                  # View limits and circuit breaker state
./trade risk check cex KRW-BTC 50000 # Pre-check if an order would pass
./trade risk set max-order-size 300000
./trade risk reset-circuit-breaker   # Manually reset after consecutive losses
```

### Circuit Breaker

Activates after consecutive losses (default: 5), blocking all buy orders for a cooldown period (default: 60 minutes). After cooldown, it resets automatically. Use `risk reset-circuit-breaker` to reset manually.

## Position & History

```bash
./trade position summary  # Open positions with unrealized PnL
./trade history list      # Order history
./trade history stats     # PnL summary (last 7 days)
./trade history export    # Export orders to CSV
```

## Stop-Loss Monitor

> **Note:** macOS only (uses LaunchAgent).

Background daemon that checks positions every 30 seconds and auto-sells when price drops below the stop-loss threshold. Stop-loss percentages are configured per market type:

| Market | Default Stop-Loss | Config Key |
|--------|------------------|------------|
| CEX | 5% | `risk.cex.stop-loss` |
| Stock | 3% | `risk.stock.stop-loss` |
| Prediction | 10% | `risk.prediction.stop-loss` |

```bash
./trade monitor install    # Install and start LaunchAgent
./trade monitor status     # Check daemon status
./trade monitor stop       # Stop daemon
./trade monitor start      # Restart daemon
./trade monitor uninstall  # Remove LaunchAgent
```

## Configuration

API keys and risk parameters are managed in `~/.trade-cli/config.yaml`.

```bash
./trade config init          # Create default config
./trade config show          # Show config (secrets masked)
./trade config set <key> <value>
```

## Testing Status

- [x] CEX (Upbit) — market data, trading, order management
- [ ] Stock (KIS) — market data, trading
- [ ] Prediction (Polymarket) — market data, trading
- [ ] Monitor daemon — stop-loss auto-sell with live position
- [ ] Cross-cutting — circuit breaker, daily loss limit, market allocation

## Tech Stack

TypeScript, Node.js 24+, commander, better-sqlite3, Vitest, pnpm

## License

MIT
