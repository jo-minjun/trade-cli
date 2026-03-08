export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_type TEXT NOT NULL CHECK(market_type IN ('cex', 'stock', 'prediction')),
  via TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
  type TEXT NOT NULL CHECK(type IN ('market', 'limit')),
  amount REAL NOT NULL,
  price REAL,
  filled_amount REAL DEFAULT 0,
  filled_price REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'filled', 'partially_filled', 'cancelled', 'rejected')),
  external_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_type TEXT NOT NULL,
  via TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL,
  avg_entry_price REAL NOT NULL,
  current_price REAL,
  unrealized_pnl REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(market_type, via, symbol)
);

CREATE TABLE IF NOT EXISTS daily_pnl (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  market_type TEXT NOT NULL,
  via TEXT NOT NULL,
  realized_pnl REAL NOT NULL DEFAULT 0,
  trade_count INTEGER NOT NULL DEFAULT 0,
  win_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(date, market_type, via)
);

CREATE TABLE IF NOT EXISTS risk_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK(event_type IN ('rejected', 'stop_loss', 'circuit_breaker')),
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS circuit_breaker_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  active INTEGER NOT NULL DEFAULT 0,
  until_iso TEXT,
  consecutive_losses INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO circuit_breaker_state (id, active, consecutive_losses) VALUES (1, 0, 0);
`;
