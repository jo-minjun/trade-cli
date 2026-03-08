import type Database from "better-sqlite3";

export interface CreateOrderInput {
  market_type: string;
  via: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  amount: number;
  price?: number;
  external_id?: string;
}

export interface OrderRow {
  id: number;
  market_type: string;
  via: string;
  symbol: string;
  side: string;
  type: string;
  amount: number;
  price: number | null;
  filled_amount: number;
  filled_price: number | null;
  status: string;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export class OrderRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateOrderInput): number {
    const stmt = this.db.prepare(
      `INSERT INTO orders (market_type, via, symbol, side, type, amount, price, external_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const result = stmt.run(
      input.market_type,
      input.via,
      input.symbol,
      input.side,
      input.type,
      input.amount,
      input.price ?? null,
      input.external_id ?? null,
    );
    return result.lastInsertRowid as number;
  }

  findById(id: number): OrderRow | undefined {
    return this.db
      .prepare("SELECT * FROM orders WHERE id = ?")
      .get(id) as OrderRow | undefined;
  }

  updateStatus(
    id: number,
    status: string,
    fill?: { filled_amount: number; filled_price: number },
  ): void {
    if (fill) {
      this.db
        .prepare(
          "UPDATE orders SET status = ?, filled_amount = ?, filled_price = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .run(status, fill.filled_amount, fill.filled_price, id);
    } else {
      this.db
        .prepare(
          "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .run(status, id);
    }
  }

  listOpen(via?: string): OrderRow[] {
    if (via) {
      return this.db
        .prepare(
          "SELECT * FROM orders WHERE via = ? AND status IN ('pending', 'partially_filled') ORDER BY created_at DESC",
        )
        .all(via) as OrderRow[];
    }
    return this.db
      .prepare(
        "SELECT * FROM orders WHERE status IN ('pending', 'partially_filled') ORDER BY created_at DESC",
      )
      .all() as OrderRow[];
  }

  listRecent(options?: {
    via?: string;
    limit?: number;
    from?: string;
  }): OrderRow[] {
    let sql = "SELECT * FROM orders WHERE 1=1";
    const params: unknown[] = [];
    if (options?.via) {
      sql += " AND via = ?";
      params.push(options.via);
    }
    if (options?.from) {
      sql += " AND created_at >= ?";
      params.push(options.from);
    }
    sql += " ORDER BY created_at DESC";
    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }
    return this.db.prepare(sql).all(...params) as OrderRow[];
  }
}

export interface UpsertPositionInput {
  market_type: string;
  via: string;
  symbol: string;
  quantity: number;
  avg_entry_price: number;
  current_price?: number;
  unrealized_pnl?: number;
}

export interface PositionRow {
  id: number;
  market_type: string;
  via: string;
  symbol: string;
  quantity: number;
  avg_entry_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  created_at: string;
  updated_at: string;
}

export class PositionRepository {
  constructor(private db: Database.Database) {}

  upsert(input: UpsertPositionInput): void {
    if (input.quantity === 0) {
      this.db
        .prepare(
          "DELETE FROM positions WHERE market_type = ? AND via = ? AND symbol = ?",
        )
        .run(input.market_type, input.via, input.symbol);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO positions (market_type, via, symbol, quantity, avg_entry_price, current_price, unrealized_pnl)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(market_type, via, symbol) DO UPDATE SET
         quantity = excluded.quantity,
         avg_entry_price = excluded.avg_entry_price,
         current_price = excluded.current_price,
         unrealized_pnl = excluded.unrealized_pnl,
         updated_at = datetime('now')`,
      )
      .run(
        input.market_type,
        input.via,
        input.symbol,
        input.quantity,
        input.avg_entry_price,
        input.current_price ?? null,
        input.unrealized_pnl ?? null,
      );
  }

  findBySymbol(
    marketType: string,
    via: string,
    symbol: string,
  ): PositionRow | undefined {
    return this.db
      .prepare(
        "SELECT * FROM positions WHERE market_type = ? AND via = ? AND symbol = ?",
      )
      .get(marketType, via, symbol) as PositionRow | undefined;
  }

  listAll(): PositionRow[] {
    return this.db
      .prepare("SELECT * FROM positions ORDER BY market_type, via, symbol")
      .all() as PositionRow[];
  }

  listByMarketType(marketType: string): PositionRow[] {
    return this.db
      .prepare(
        "SELECT * FROM positions WHERE market_type = ? ORDER BY via, symbol",
      )
      .all(marketType) as PositionRow[];
  }

  totalExposure(): number {
    const row = this.db
      .prepare(
        "SELECT COALESCE(SUM(quantity * avg_entry_price), 0) as total FROM positions",
      )
      .get() as { total: number };
    return row.total;
  }

  totalExposureByMarketType(marketType: string): number {
    const row = this.db
      .prepare(
        "SELECT COALESCE(SUM(quantity * avg_entry_price), 0) as total FROM positions WHERE market_type = ?",
      )
      .get(marketType) as { total: number };
    return row.total;
  }
}

export class DailyPnlRepository {
  constructor(private db: Database.Database) {}

  record(
    date: string,
    marketType: string,
    via: string,
    pnl: number,
    isWin: boolean,
  ): void {
    this.db
      .prepare(
        `INSERT INTO daily_pnl (date, market_type, via, realized_pnl, trade_count, win_count)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(date, market_type, via) DO UPDATE SET
         realized_pnl = daily_pnl.realized_pnl + excluded.realized_pnl,
         trade_count = daily_pnl.trade_count + 1,
         win_count = daily_pnl.win_count + excluded.win_count`,
      )
      .run(date, marketType, via, pnl, isWin ? 1 : 0);
  }

  getByDate(
    date: string,
    marketType: string,
    via: string,
  ):
    | { realized_pnl: number; trade_count: number; win_count: number }
    | undefined {
    return this.db
      .prepare(
        "SELECT realized_pnl, trade_count, win_count FROM daily_pnl WHERE date = ? AND market_type = ? AND via = ?",
      )
      .get(date, marketType, via) as
      | { realized_pnl: number; trade_count: number; win_count: number }
      | undefined;
  }

  getTodayTotalPnl(date: string): number {
    const row = this.db
      .prepare(
        "SELECT COALESCE(SUM(realized_pnl), 0) as total FROM daily_pnl WHERE date = ?",
      )
      .get(date) as { total: number };
    return row.total;
  }
}

export class RiskEventRepository {
  constructor(private db: Database.Database) {}

  log(eventType: string, details: string): void {
    this.db
      .prepare("INSERT INTO risk_events (event_type, details) VALUES (?, ?)")
      .run(eventType, details);
  }

  recent(
    limit = 20,
  ): {
    id: number;
    event_type: string;
    details: string;
    created_at: string;
  }[] {
    return this.db
      .prepare("SELECT * FROM risk_events ORDER BY created_at DESC LIMIT ?")
      .all(limit) as {
      id: number;
      event_type: string;
      details: string;
      created_at: string;
    }[];
  }
}

export interface CircuitBreakerRow {
  active: number;
  until_iso: string | null;
  consecutive_losses: number;
}

export class CircuitBreakerRepository {
  constructor(private db: Database.Database) {}

  load(): CircuitBreakerRow {
    return this.db
      .prepare("SELECT active, until_iso, consecutive_losses FROM circuit_breaker_state WHERE id = 1")
      .get() as CircuitBreakerRow;
  }

  save(active: boolean, untilIso: string | null, consecutiveLosses: number): void {
    this.db
      .prepare(
        "UPDATE circuit_breaker_state SET active = ?, until_iso = ?, consecutive_losses = ?, updated_at = datetime('now') WHERE id = 1",
      )
      .run(active ? 1 : 0, untilIso, consecutiveLosses);
  }
}
