# CEX (Crypto Exchange) Guide

This guide covers using trade-cli with Upbit, a Korean cryptocurrency exchange.

## Configuration

### 1. Get Upbit API Keys

1. Log in to [upbit.com](https://upbit.com)
2. Go to **My Page > Open API Management**
3. Create a new API key and copy the **Access Key** and **Secret Key**

> **Security Note:** Never share your API keys. If compromised, delete them immediately from Upbit and generate new ones.

### 2. Initialize Config

```bash
./trade config init
```

This creates `~/.trade-cli/config.yaml` with default settings.

### 3. Set API Keys

```bash
./trade config set cex.upbit.api-key YOUR_ACCESS_KEY
./trade config set cex.upbit.secret-key YOUR_SECRET_KEY
```

### 4. Verify Config

```bash
./trade config show
```

API keys are masked in the output for security.

## Market Data

### Price

```bash
./trade cex price KRW-BTC
```

```
KRW-BTC
  Price: 99,480,000
  Change: +95000 (0.10%)
  24h Volume: 955.497
  24h High/Low: 99,739,000 / 98,512,000
```

### Order Book

```bash
./trade cex orderbook KRW-BTC
```

Shows top 5 ask/bid levels with price and size.

### Candles

```bash
./trade cex candles KRW-BTC --interval 1d --count 5
```

**Options:**
- `--interval` — Candle interval: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1w`, `1M` (default: `1h`)
- `--count` — Number of candles (default: `10`)

## Trading

### Balance

```bash
./trade cex balance
```

### Buy

**Market order** (amount in KRW):

```bash
./trade cex buy KRW-BTC 5000
```

Buys 5,000 KRW worth of BTC at current market price.

**Limit order** (amount in quantity):

```bash
./trade cex buy KRW-BTC 0.0001 --type limit --price 95000000
```

Buys 0.0001 BTC at 95,000,000 KRW. Order stays open until filled or cancelled.

### Sell

**Market order** (amount in quantity):

```bash
./trade cex sell KRW-BTC 0.0001
```

**Limit order:**

```bash
./trade cex sell KRW-BTC 0.0001 --type limit --price 105000000
```

### Open Orders

```bash
./trade cex orders
```

### Cancel

```bash
./trade cex cancel <order-id>
```

The order ID is returned when placing an order.

## Reference

### Symbol Format

Both formats are accepted and automatically converted:

- `KRW-BTC` (Upbit native format)
- `BTC-KRW` (converted to `KRW-BTC`)

### Upbit Constraints

- **Minimum order amount:** 5,000 KRW
- **Market buy:** Amount is in KRW (e.g., `5000` = buy 5,000 KRW worth)
- **Market sell:** Amount is in quantity (e.g., `0.0001` = sell 0.0001 BTC)

### --via Option

All `cex` commands accept `--via <exchange>` to specify the exchange. Defaults to `config.cex.default-via` (initially `upbit`).
