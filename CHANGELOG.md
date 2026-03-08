# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
