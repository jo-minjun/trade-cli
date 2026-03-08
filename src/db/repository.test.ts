import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { openDatabase } from "./database.js";
import {
  OrderRepository,
  PositionRepository,
  DailyPnlRepository,
} from "./repository.js";
import type Database from "better-sqlite3";

describe("OrderRepository", () => {
  let db: Database.Database;
  let repo: OrderRepository;
  const dbPath = join(import.meta.dirname, "../../.test-trade.db");

  beforeEach(() => {
    db = openDatabase(dbPath);
    repo = new OrderRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dbPath, { force: true });
  });

  it("creates and retrieves an order", () => {
    const id = repo.create({
      market_type: "cex",
      via: "upbit",
      symbol: "BTC-KRW",
      side: "buy",
      type: "market",
      amount: 100000,
    });
    const order = repo.findById(id);
    expect(order).toBeDefined();
    expect(order!.symbol).toBe("BTC-KRW");
    expect(order!.status).toBe("pending");
  });

  it("updates order status", () => {
    const id = repo.create({
      market_type: "cex",
      via: "upbit",
      symbol: "BTC-KRW",
      side: "buy",
      type: "market",
      amount: 100000,
    });
    repo.updateStatus(id, "filled", {
      filled_amount: 100000,
      filled_price: 133000000,
    });
    const order = repo.findById(id);
    expect(order!.status).toBe("filled");
    expect(order!.filled_amount).toBe(100000);
  });

  it("lists open orders by exchange", () => {
    repo.create({
      market_type: "cex",
      via: "upbit",
      symbol: "BTC-KRW",
      side: "buy",
      type: "limit",
      amount: 100000,
    });
    repo.create({
      market_type: "cex",
      via: "upbit",
      symbol: "ETH-KRW",
      side: "sell",
      type: "limit",
      amount: 50000,
    });
    const orders = repo.listOpen("upbit");
    expect(orders).toHaveLength(2);
  });
});

describe("PositionRepository", () => {
  let db: Database.Database;
  let repo: PositionRepository;
  const dbPath = join(import.meta.dirname, "../../.test-trade-pos.db");

  beforeEach(() => {
    db = openDatabase(dbPath);
    repo = new PositionRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dbPath, { force: true });
  });

  it("upserts and retrieves a position", () => {
    repo.upsert({
      market_type: "cex",
      via: "upbit",
      symbol: "BTC-KRW",
      quantity: 0.001,
      avg_entry_price: 133000000,
    });
    const pos = repo.findBySymbol("cex", "upbit", "BTC-KRW");
    expect(pos).toBeDefined();
    expect(pos!.quantity).toBe(0.001);
  });

  it("deletes position when quantity is 0", () => {
    repo.upsert({
      market_type: "cex",
      via: "upbit",
      symbol: "BTC-KRW",
      quantity: 0.001,
      avg_entry_price: 133000000,
    });
    repo.upsert({
      market_type: "cex",
      via: "upbit",
      symbol: "BTC-KRW",
      quantity: 0,
      avg_entry_price: 0,
    });
    const pos = repo.findBySymbol("cex", "upbit", "BTC-KRW");
    expect(pos).toBeUndefined();
  });

  it("returns all positions", () => {
    repo.upsert({
      market_type: "cex",
      via: "upbit",
      symbol: "BTC-KRW",
      quantity: 0.001,
      avg_entry_price: 133000000,
    });
    repo.upsert({
      market_type: "stock",
      via: "kis",
      symbol: "005930",
      quantity: 10,
      avg_entry_price: 70000,
    });
    const all = repo.listAll();
    expect(all).toHaveLength(2);
  });
});

describe("DailyPnlRepository", () => {
  let db: Database.Database;
  let repo: DailyPnlRepository;
  const dbPath = join(import.meta.dirname, "../../.test-trade-pnl.db");

  beforeEach(() => {
    db = openDatabase(dbPath);
    repo = new DailyPnlRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dbPath, { force: true });
  });

  it("records and accumulates daily PnL", () => {
    repo.record("2026-03-08", "cex", "upbit", 5000, true);
    repo.record("2026-03-08", "cex", "upbit", -2000, false);
    const pnl = repo.getByDate("2026-03-08", "cex", "upbit");
    expect(pnl!.realized_pnl).toBe(3000);
    expect(pnl!.trade_count).toBe(2);
    expect(pnl!.win_count).toBe(1);
  });

  it("returns total PnL for a date", () => {
    repo.record("2026-03-08", "cex", "upbit", -10000, false);
    repo.record("2026-03-08", "stock", "kis", -5000, false);
    const total = repo.getTodayTotalPnl("2026-03-08");
    expect(total).toBe(-15000);
  });
});
