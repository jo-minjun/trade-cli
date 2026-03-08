# trade-cli

A lightweight trading CLI tool designed to work with OpenClaw AI agents.

AI handles market analysis and strategy decisions, while trade-cli handles order execution and risk management.

## Supported Markets

| Market | Exchange/Broker | Status |
|--------|----------------|--------|
| Crypto (CEX) | Upbit | WIP |
| Stocks | Korea Investment & Securities (KIS) | WIP |
| Prediction Markets | Polymarket | WIP |

## Installation

```bash
git clone https://github.com/user/trade-cli.git
cd trade-cli
pnpm install
chmod +x trade
```

## Usage

```bash
# Initial setup
trade config init

# Price quotes
trade cex price BTC-KRW --via upbit
trade stock price 005930 --via kis

# Orders
trade cex buy BTC-KRW 100000 --via upbit
trade stock buy 005930 100000 --via kis
trade prediction buy <market-id> YES 50000 --via polymarket

# Risk check
trade risk status
trade risk check cex BTC-KRW 100000 --via upbit

# Portfolio
trade position summary
trade history stats --period 7d

# Stop-loss monitor
trade monitor install
trade monitor status
```

## Default --via

Set defaults to skip `--via` on every command:

```bash
trade config set cex.default-via upbit
trade config set stock.default-via kis
trade config set prediction.default-via polymarket
```

## Risk Management

Every order automatically runs a risk check before execution. AI agents cannot bypass risk limits.

- Max order size limit
- Daily loss limit
- Per-exchange allocation limit
- Total exposure limit
- Automatic stop-loss (monitor daemon)
- Circuit breaker (halts trading after consecutive losses)

## Configuration

API keys and risk parameters are managed in `~/.trade-cli/config.yaml`.

```yaml
risk:
  max-total-capital: 1000000
  max-daily-loss: 50000
  max-order-size: 200000
  max-total-exposure: 0.8
  max-position-ratio: 0.3
```

## Tech Stack

TypeScript, Node.js 24+, commander, better-sqlite3, Vitest, pnpm

## License

MIT
