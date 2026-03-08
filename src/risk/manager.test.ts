import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { openDatabase } from "../db/database.js";
import { PositionRepository, DailyPnlRepository } from "../db/repository.js";
import { RiskManager } from "./manager.js";
import { DEFAULT_RISK } from "../config/defaults.js";
import type Database from "better-sqlite3";

describe("RiskManager", () => {
  let db: Database.Database;
  let risk: RiskManager;
  const dbPath = join(import.meta.dirname, "../../.test-risk.db");

  beforeEach(() => {
    db = openDatabase(dbPath);
    risk = new RiskManager(DEFAULT_RISK, db);
  });

  afterEach(() => {
    db.close();
    rmSync(dbPath, { force: true });
  });

  it("approves order within limits", () => {
    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", amount: 100000 });
    expect(result.approved).toBe(true);
  });

  it("rejects order exceeding max order size", () => {
    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", amount: 300000 });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("order size");
  });

  it("rejects order when daily loss limit exceeded", () => {
    const pnlRepo = new DailyPnlRepository(db);
    const today = new Date().toISOString().split("T")[0];
    pnlRepo.record(today, "cex", "upbit", -45000, false);

    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", amount: 100000 });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("daily loss");
  });

  it("rejects order exceeding market allocation limit", () => {
    const posRepo = new PositionRepository(db);
    posRepo.upsert({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", quantity: 1, avg_entry_price: 350000 });

    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "ETH-KRW", side: "buy", amount: 100000 });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("allocation");
  });

  it("rejects order when circuit breaker is active", () => {
    risk.activateCircuitBreaker();
    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", amount: 10000 });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("circuit breaker");
  });

  it("approves order after circuit breaker reset", () => {
    risk.activateCircuitBreaker();
    risk.resetCircuitBreaker();
    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", amount: 10000 });
    expect(result.approved).toBe(true);
  });

  it("auto-activates circuit breaker after consecutive losses", () => {
    for (let i = 0; i < 5; i++) {
      risk.recordLoss();
    }
    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", amount: 10000 });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("circuit breaker");
  });
});
