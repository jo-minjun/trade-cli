# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Configurable monitor polling interval via `monitor.interval-seconds` in config.yaml
- KIS `getOrder()` and `getOpenOrders()` using daily order inquiry API (`TTTC8001R`)
- `stock orders` command for listing open stock orders
- `stock candles` command for viewing daily candle data
- `OrderRepository.findByExternalId()` for order lookup by exchange-side ID
- Order status polling (`waitForFill`) for stock buy/sell commands
- Cancel DB sync: internal order status updated to `cancelled` on `stock cancel` and `cex cancel`
- Polymarket trading via `@polymarket/clob-client` SDK (`placeOrder`, `cancelOrder`, `getBalance`, `getOpenOrders`)
- `config setup --via polymarket` command for API credential generation
- `--price` option for `prediction buy` and `prediction sell`
- Extended `PolymarketCredentials` with api-key, api-secret, api-passphrase, funder-address
- CEX Guide documentation (`CEX_GUIDE.md`)
- Testing status checklist in README
- `cex orders` command for listing open orders
- Order status polling after placement (market and limit orders)
- Config key validation (rejects unknown top-level keys)
- Stop-loss monitor: PATH and WorkingDirectory in LaunchAgent plist

### Fixed

- Upbit `toMarket()` symbol conversion (`KRW-BTC` no longer incorrectly swapped)
- Upbit market order status mapping (`state: "cancel"` with fills now treated as `"filled"`)
- Filled price calculation from Upbit `trades` array
- `--via` default now reads from config instead of hardcoded values
- Monitor `status` no longer leaks stderr from `launchctl`
- Monitor daemon crash due to missing `node` and `tsx` in launchd environment

### Changed

- `PolymarketExchange` now implements `PredictionExchange` interface (was `Exchange`)
- `PolymarketExchange` constructor accepts `PolymarketCredentials` object (was plain string)
- `getCandles()` now throws "Not supported" for Polymarket (was returning empty array)
- README rewritten with 6-step risk check table, circuit breaker details, stop-loss config, and macOS note
- Command examples standardized to `./trade` and `KRW-BTC` format

## [0.1.0] - 2026-03-08

### Added

- Config module with load, save, defaults, and deep merge
- Database module with schema, repositories, and CRUD operations
- Risk manager with 5-stage checks and circuit breaker
- Exchange common interface definition
- Upbit adapter with JWT auth and REST client
- KIS adapter with OAuth auth and stock trading
- Polymarket adapter with CLOB API and market search
- Exchange registry
- CLI commands: config (init, show, set), cex, prediction, stock, risk, position, history
- Main entry point wiring all CLI commands
- Stop-loss monitor runner with LaunchAgent integration
- Monitor CLI commands (install, start, stop, status)

### Fixed

- Critical risk management bugs
- Code review findings (security, business, quality)
