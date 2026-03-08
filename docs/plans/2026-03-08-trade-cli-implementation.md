# trade-cli Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upbit, KIS, Polymarket 세 시장을 지원하는 트레이딩 CLI 도구를 구축한다. 리스크 관리가 코드 레벨로 강제되는 안전한 자동 트레이딩 시스템.

**Architecture:** 레이어드 구조 — Config → DB → Risk → Exchange Adapters → CLI Commands → Monitor. 각 거래소 어댑터는 공통 인터페이스를 구현하며, 리스크 매니저가 모든 주문을 게이트킵한다.

**Tech Stack:** TypeScript (ESM), Node.js 22+, commander, better-sqlite3, undici, yaml, Vitest, pnpm, tsdown, launchd

---

## Phase 1: Foundation

### Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `tsdown.config.ts`
- Create: `trade` (CLI 엔트리포인트)
- Create: `src/index.ts`

**Step 1: 프로젝트 초기화**

```bash
cd ~/Projects/me/trade-cli
pnpm init
```

**Step 2: 의존성 설치**

```bash
pnpm add commander better-sqlite3 undici yaml chalk
pnpm add -D typescript @types/node @types/better-sqlite3 vitest tsdown
```

**Step 3: tsconfig.json 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 4: vitest.config.ts 작성**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 5: tsdown.config.ts 작성**

```typescript
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  dts: true,
  clean: true,
});
```

**Step 6: package.json 스크립트 추가**

```json
{
  "type": "module",
  "bin": { "trade": "./trade" },
  "scripts": {
    "dev": "node --import tsx src/index.ts",
    "build": "tsdown",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

**Step 7: CLI 엔트리포인트 작성**

`trade` 파일:
```bash
#!/usr/bin/env node --import tsx
import("./src/index.ts");
```

`src/index.ts`:
```typescript
import { Command } from "commander";

const program = new Command();

program
  .name("trade")
  .description("트레이딩 CLI 도구")
  .version("0.1.0");

program.parse();
```

**Step 8: 실행 확인**

```bash
chmod +x trade
./trade --help
```

Expected: 도움말 출력

**Step 9: 커밋**

```bash
git add -A
git commit -m "chore: 프로젝트 스캐폴딩"
```

---

### Task 2: Config 모듈

**Files:**
- Create: `src/config/types.ts`
- Create: `src/config/defaults.ts`
- Create: `src/config/loader.ts`
- Create: `src/config/loader.test.ts`

**Step 1: Config 타입 정의**

`src/config/types.ts`:
```typescript
export interface ExchangeCredentials {
  "api-key": string;
  "secret-key": string;
}

export interface KisCredentials {
  "app-key": string;
  "app-secret": string;
  "account-no": string;
}

export interface PolymarketCredentials {
  "private-key": string;
}

export interface CircuitBreakerConfig {
  "consecutive-losses": number;
  "cooldown-minutes": number;
}

export interface MarketRiskConfig {
  "max-allocation": number;
  "stop-loss": number;
}

export interface RiskConfig {
  "max-total-capital": number;
  "max-daily-loss": number;
  "max-total-exposure": number;
  "max-order-size": number;
  "max-position-ratio": number;
  "circuit-breaker": CircuitBreakerConfig;
  cex: MarketRiskConfig;
  stock: MarketRiskConfig;
  prediction: MarketRiskConfig;
}

export interface TradeConfig {
  cex: {
    "default-via": string;
    [exchange: string]: unknown;
  };
  stock: {
    "default-via": string;
    [broker: string]: unknown;
  };
  prediction: {
    "default-via": string;
    [platform: string]: unknown;
  };
  risk: RiskConfig;
}
```

**Step 2: 기본값 정의**

`src/config/defaults.ts`:
```typescript
import type { RiskConfig, TradeConfig } from "./types.js";

export const DEFAULT_RISK: RiskConfig = {
  "max-total-capital": 1000000,
  "max-daily-loss": 50000,
  "max-total-exposure": 0.8,
  "max-order-size": 200000,
  "max-position-ratio": 0.3,
  "circuit-breaker": {
    "consecutive-losses": 5,
    "cooldown-minutes": 60,
  },
  cex: { "max-allocation": 400000, "stop-loss": 0.05 },
  stock: { "max-allocation": 400000, "stop-loss": 0.03 },
  prediction: { "max-allocation": 200000, "stop-loss": 0.1 },
};

export const DEFAULT_CONFIG: TradeConfig = {
  cex: { "default-via": "upbit" },
  stock: { "default-via": "kis" },
  prediction: { "default-via": "polymarket" },
  risk: DEFAULT_RISK,
};
```

**Step 3: 테스트 작성**

`src/config/loader.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, saveConfig, getConfigDir } from "./loader.js";
import { DEFAULT_CONFIG } from "./defaults.js";

describe("config loader", () => {
  const testDir = join(import.meta.dirname, "../../.test-trade-cli");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("설정 파일이 없으면 기본값을 반환한다", () => {
    const config = loadConfig(testDir);
    expect(config.risk["max-total-capital"]).toBe(1000000);
    expect(config.cex["default-via"]).toBe("upbit");
  });

  it("설정 파일을 저장하고 로드한다", () => {
    const config = { ...DEFAULT_CONFIG };
    config.risk["max-total-capital"] = 2000000;
    saveConfig(config, testDir);

    const loaded = loadConfig(testDir);
    expect(loaded.risk["max-total-capital"]).toBe(2000000);
  });

  it("설정 파일의 값이 기본값을 오버라이드한다", () => {
    const partial = "risk:\n  max-total-capital: 500000\n";
    writeFileSync(join(testDir, "config.yaml"), partial);

    const config = loadConfig(testDir);
    expect(config.risk["max-total-capital"]).toBe(500000);
    // 나머지는 기본값 유지
    expect(config.risk["max-daily-loss"]).toBe(50000);
  });
});
```

**Step 4: 테스트 실행하여 실패 확인**

```bash
pnpm test src/config/loader.test.ts
```

Expected: FAIL — `loader.js` 모듈이 없음

**Step 5: loader 구현**

`src/config/loader.ts`:
```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "yaml";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { TradeConfig } from "./types.js";

export function getConfigDir(): string {
  return join(homedir(), ".trade-cli");
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function loadConfig(configDir?: string): TradeConfig {
  const dir = configDir ?? getConfigDir();
  const filePath = join(dir, "config.yaml");

  if (!existsSync(filePath)) {
    return structuredClone(DEFAULT_CONFIG);
  }

  const raw = readFileSync(filePath, "utf-8");
  const parsed = parse(raw) ?? {};
  return deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, parsed) as unknown as TradeConfig;
}

export function saveConfig(config: TradeConfig, configDir?: string): void {
  const dir = configDir ?? getConfigDir();
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "config.yaml");
  writeFileSync(filePath, stringify(config));
}
```

**Step 6: 테스트 통과 확인**

```bash
pnpm test src/config/loader.test.ts
```

Expected: PASS

**Step 7: 커밋**

```bash
git add src/config/
git commit -m "feat: config 모듈 (로드, 저장, 기본값, 딥 머지)"
```

---

### Task 3: Database 모듈

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/database.ts`
- Create: `src/db/repository.ts`
- Create: `src/db/repository.test.ts`

**Step 1: 스키마 정의**

`src/db/schema.ts`:
```typescript
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
`;
```

**Step 2: Database 연결 래퍼**

`src/db/database.ts`:
```typescript
import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { getConfigDir } from "../config/loader.js";
import { SCHEMA_SQL } from "./schema.js";

export function openDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? join(getConfigDir(), "trade.db");
  mkdirSync(join(path, ".."), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}
```

**Step 3: Repository 테스트 작성**

`src/db/repository.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { openDatabase } from "./database.js";
import { OrderRepository, PositionRepository, DailyPnlRepository, RiskEventRepository } from "./repository.js";
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

  it("주문을 생성하고 조회한다", () => {
    const id = repo.create({
      market_type: "cex", via: "upbit", symbol: "BTC-KRW",
      side: "buy", type: "market", amount: 100000,
    });
    const order = repo.findById(id);
    expect(order).toBeDefined();
    expect(order!.symbol).toBe("BTC-KRW");
    expect(order!.status).toBe("pending");
  });

  it("주문 상태를 업데이트한다", () => {
    const id = repo.create({
      market_type: "cex", via: "upbit", symbol: "BTC-KRW",
      side: "buy", type: "market", amount: 100000,
    });
    repo.updateStatus(id, "filled", { filled_amount: 100000, filled_price: 133000000 });
    const order = repo.findById(id);
    expect(order!.status).toBe("filled");
    expect(order!.filled_amount).toBe(100000);
  });

  it("거래소별 미체결 주문을 조회한다", () => {
    repo.create({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", type: "limit", amount: 100000 });
    repo.create({ market_type: "cex", via: "upbit", symbol: "ETH-KRW", side: "sell", type: "limit", amount: 50000 });
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

  it("포지션을 upsert하고 조회한다", () => {
    repo.upsert({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", quantity: 0.001, avg_entry_price: 133000000 });
    const pos = repo.findBySymbol("cex", "upbit", "BTC-KRW");
    expect(pos).toBeDefined();
    expect(pos!.quantity).toBe(0.001);
  });

  it("수량이 0이면 포지션을 삭제한다", () => {
    repo.upsert({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", quantity: 0.001, avg_entry_price: 133000000 });
    repo.upsert({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", quantity: 0, avg_entry_price: 0 });
    const pos = repo.findBySymbol("cex", "upbit", "BTC-KRW");
    expect(pos).toBeUndefined();
  });

  it("전체 포지션 목록을 반환한다", () => {
    repo.upsert({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", quantity: 0.001, avg_entry_price: 133000000 });
    repo.upsert({ market_type: "stock", via: "kis", symbol: "005930", quantity: 10, avg_entry_price: 70000 });
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

  it("일일 PnL을 기록하고 누적한다", () => {
    repo.record("2026-03-08", "cex", "upbit", 5000, true);
    repo.record("2026-03-08", "cex", "upbit", -2000, false);
    const pnl = repo.getByDate("2026-03-08", "cex", "upbit");
    expect(pnl!.realized_pnl).toBe(3000);
    expect(pnl!.trade_count).toBe(2);
    expect(pnl!.win_count).toBe(1);
  });

  it("오늘의 총 손익을 반환한다", () => {
    repo.record("2026-03-08", "cex", "upbit", -10000, false);
    repo.record("2026-03-08", "stock", "kis", -5000, false);
    const total = repo.getTodayTotalPnl("2026-03-08");
    expect(total).toBe(-15000);
  });
});
```

**Step 4: 테스트 실행하여 실패 확인**

```bash
pnpm test src/db/repository.test.ts
```

Expected: FAIL — `repository.js` 모듈이 없음

**Step 5: Repository 구현**

`src/db/repository.ts`:
```typescript
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
    const result = stmt.run(input.market_type, input.via, input.symbol, input.side, input.type, input.amount, input.price ?? null, input.external_id ?? null);
    return result.lastInsertRowid as number;
  }

  findById(id: number): OrderRow | undefined {
    return this.db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
  }

  updateStatus(id: number, status: string, fill?: { filled_amount: number; filled_price: number }): void {
    if (fill) {
      this.db.prepare(
        "UPDATE orders SET status = ?, filled_amount = ?, filled_price = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(status, fill.filled_amount, fill.filled_price, id);
    } else {
      this.db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    }
  }

  listOpen(via?: string): OrderRow[] {
    if (via) {
      return this.db.prepare("SELECT * FROM orders WHERE via = ? AND status IN ('pending', 'partially_filled') ORDER BY created_at DESC").all(via) as OrderRow[];
    }
    return this.db.prepare("SELECT * FROM orders WHERE status IN ('pending', 'partially_filled') ORDER BY created_at DESC").all() as OrderRow[];
  }

  listRecent(options?: { via?: string; limit?: number; from?: string }): OrderRow[] {
    let sql = "SELECT * FROM orders WHERE 1=1";
    const params: unknown[] = [];
    if (options?.via) { sql += " AND via = ?"; params.push(options.via); }
    if (options?.from) { sql += " AND created_at >= ?"; params.push(options.from); }
    sql += " ORDER BY created_at DESC";
    if (options?.limit) { sql += " LIMIT ?"; params.push(options.limit); }
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
      this.db.prepare("DELETE FROM positions WHERE market_type = ? AND via = ? AND symbol = ?")
        .run(input.market_type, input.via, input.symbol);
      return;
    }
    this.db.prepare(
      `INSERT INTO positions (market_type, via, symbol, quantity, avg_entry_price, current_price, unrealized_pnl)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(market_type, via, symbol) DO UPDATE SET
         quantity = excluded.quantity,
         avg_entry_price = excluded.avg_entry_price,
         current_price = excluded.current_price,
         unrealized_pnl = excluded.unrealized_pnl,
         updated_at = datetime('now')`,
    ).run(input.market_type, input.via, input.symbol, input.quantity, input.avg_entry_price, input.current_price ?? null, input.unrealized_pnl ?? null);
  }

  findBySymbol(marketType: string, via: string, symbol: string): PositionRow | undefined {
    return this.db.prepare("SELECT * FROM positions WHERE market_type = ? AND via = ? AND symbol = ?")
      .get(marketType, via, symbol) as PositionRow | undefined;
  }

  listAll(): PositionRow[] {
    return this.db.prepare("SELECT * FROM positions ORDER BY market_type, via, symbol").all() as PositionRow[];
  }

  listByMarketType(marketType: string): PositionRow[] {
    return this.db.prepare("SELECT * FROM positions WHERE market_type = ? ORDER BY via, symbol").all(marketType) as PositionRow[];
  }

  totalExposure(): number {
    const row = this.db.prepare("SELECT COALESCE(SUM(quantity * avg_entry_price), 0) as total FROM positions").get() as { total: number };
    return row.total;
  }

  totalExposureByMarketType(marketType: string): number {
    const row = this.db.prepare("SELECT COALESCE(SUM(quantity * avg_entry_price), 0) as total FROM positions WHERE market_type = ?").get(marketType) as { total: number };
    return row.total;
  }
}

export class DailyPnlRepository {
  constructor(private db: Database.Database) {}

  record(date: string, marketType: string, via: string, pnl: number, isWin: boolean): void {
    this.db.prepare(
      `INSERT INTO daily_pnl (date, market_type, via, realized_pnl, trade_count, win_count)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(date, market_type, via) DO UPDATE SET
         realized_pnl = daily_pnl.realized_pnl + excluded.realized_pnl,
         trade_count = daily_pnl.trade_count + 1,
         win_count = daily_pnl.win_count + excluded.win_count`,
    ).run(date, marketType, via, pnl, isWin ? 1 : 0);
  }

  getByDate(date: string, marketType: string, via: string): { realized_pnl: number; trade_count: number; win_count: number } | undefined {
    return this.db.prepare("SELECT realized_pnl, trade_count, win_count FROM daily_pnl WHERE date = ? AND market_type = ? AND via = ?")
      .get(date, marketType, via) as { realized_pnl: number; trade_count: number; win_count: number } | undefined;
  }

  getTodayTotalPnl(date: string): number {
    const row = this.db.prepare("SELECT COALESCE(SUM(realized_pnl), 0) as total FROM daily_pnl WHERE date = ?").get(date) as { total: number };
    return row.total;
  }
}

export class RiskEventRepository {
  constructor(private db: Database.Database) {}

  log(eventType: string, details: string): void {
    this.db.prepare("INSERT INTO risk_events (event_type, details) VALUES (?, ?)").run(eventType, details);
  }

  recent(limit = 20): { id: number; event_type: string; details: string; created_at: string }[] {
    return this.db.prepare("SELECT * FROM risk_events ORDER BY created_at DESC LIMIT ?").all(limit) as { id: number; event_type: string; details: string; created_at: string }[];
  }
}
```

**Step 6: 테스트 통과 확인**

```bash
pnpm test src/db/repository.test.ts
```

Expected: PASS

**Step 7: 커밋**

```bash
git add src/db/
git commit -m "feat: database 모듈 (스키마, 리포지토리, CRUD)"
```

---

## Phase 2: Risk Manager

### Task 4: 리스크 매니저

**Files:**
- Create: `src/risk/manager.ts`
- Create: `src/risk/manager.test.ts`

**Step 1: 테스트 작성**

`src/risk/manager.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { openDatabase } from "../db/database.js";
import { OrderRepository, PositionRepository, DailyPnlRepository, RiskEventRepository } from "../db/repository.js";
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

  it("주문 크기가 한도 내이면 통과한다", () => {
    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", amount: 100000 });
    expect(result.approved).toBe(true);
  });

  it("단일 주문 크기 초과 시 거부한다", () => {
    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", amount: 300000 });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("주문 크기");
  });

  it("일일 손실 한도 초과 시 거부한다", () => {
    const pnlRepo = new DailyPnlRepository(db);
    const today = new Date().toISOString().split("T")[0];
    pnlRepo.record(today, "cex", "upbit", -45000, false);

    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", amount: 100000 });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("일일 손실");
  });

  it("거래소별 배분 한도 초과 시 거부한다", () => {
    const posRepo = new PositionRepository(db);
    posRepo.upsert({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", quantity: 1, avg_entry_price: 350000 });

    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "ETH-KRW", side: "buy", amount: 100000 });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("배분 한도");
  });

  it("서킷 브레이커 활성 시 거부한다", () => {
    risk.activateCircuitBreaker();
    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", amount: 10000 });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("서킷 브레이커");
  });

  it("서킷 브레이커를 리셋하면 다시 통과한다", () => {
    risk.activateCircuitBreaker();
    risk.resetCircuitBreaker();
    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", amount: 10000 });
    expect(result.approved).toBe(true);
  });

  it("연속 손실 횟수 초과 시 서킷 브레이커를 자동 활성화한다", () => {
    for (let i = 0; i < 5; i++) {
      risk.recordLoss();
    }
    const result = risk.check({ market_type: "cex", via: "upbit", symbol: "BTC-KRW", side: "buy", amount: 10000 });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("서킷 브레이커");
  });
});
```

**Step 2: 테스트 실행하여 실패 확인**

```bash
pnpm test src/risk/manager.test.ts
```

Expected: FAIL

**Step 3: RiskManager 구현**

`src/risk/manager.ts`:
```typescript
import type Database from "better-sqlite3";
import type { RiskConfig } from "../config/types.js";
import { PositionRepository, DailyPnlRepository, RiskEventRepository } from "../db/repository.js";

export interface RiskCheckInput {
  market_type: "cex" | "stock" | "prediction";
  via: string;
  symbol: string;
  side: "buy" | "sell";
  amount: number;
}

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
}

export class RiskManager {
  private positionRepo: PositionRepository;
  private pnlRepo: DailyPnlRepository;
  private eventRepo: RiskEventRepository;
  private circuitBreakerActive = false;
  private circuitBreakerUntil: Date | null = null;
  private consecutiveLosses = 0;

  constructor(
    private config: RiskConfig,
    private db: Database.Database,
  ) {
    this.positionRepo = new PositionRepository(db);
    this.pnlRepo = new DailyPnlRepository(db);
    this.eventRepo = new RiskEventRepository(db);
  }

  check(input: RiskCheckInput): RiskCheckResult {
    // 매도는 리스크 체크 없이 통과
    if (input.side === "sell") {
      return { approved: true };
    }

    // 1. 서킷 브레이커 확인
    if (this.isCircuitBreakerActive()) {
      this.eventRepo.log("rejected", `서킷 브레이커 활성 중: ${input.symbol} ${input.amount}`);
      return { approved: false, reason: "서킷 브레이커가 활성 상태입니다" };
    }

    // 2. 단일 주문 크기 확인
    if (input.amount > this.config["max-order-size"]) {
      this.eventRepo.log("rejected", `주문 크기 초과: ${input.amount} > ${this.config["max-order-size"]}`);
      return { approved: false, reason: `단일 주문 크기 한도 초과 (${input.amount} > ${this.config["max-order-size"]})` };
    }

    // 3. 일일 손실 한도 확인
    const today = new Date().toISOString().split("T")[0];
    const todayPnl = this.pnlRepo.getTodayTotalPnl(today);
    if (todayPnl <= -this.config["max-daily-loss"]) {
      this.eventRepo.log("rejected", `일일 손실 한도 도달: ${todayPnl}`);
      return { approved: false, reason: `일일 손실 한도 초과 (현재: ${todayPnl}, 한도: -${this.config["max-daily-loss"]})` };
    }

    // 4. 거래소별 배분 한도 확인
    const marketConfig = this.config[input.market_type];
    const currentExposure = this.positionRepo.totalExposureByMarketType(input.market_type);
    if (currentExposure + input.amount > marketConfig["max-allocation"]) {
      this.eventRepo.log("rejected", `배분 한도 초과: ${input.market_type} ${currentExposure + input.amount} > ${marketConfig["max-allocation"]}`);
      return { approved: false, reason: `${input.market_type} 배분 한도 초과 (현재: ${currentExposure}, 추가: ${input.amount}, 한도: ${marketConfig["max-allocation"]})` };
    }

    // 5. 총 노출도 확인
    const totalExposure = this.positionRepo.totalExposure();
    const maxExposure = this.config["max-total-capital"] * this.config["max-total-exposure"];
    if (totalExposure + input.amount > maxExposure) {
      this.eventRepo.log("rejected", `총 노출도 초과: ${totalExposure + input.amount} > ${maxExposure}`);
      return { approved: false, reason: `총 노출도 한도 초과 (현재: ${totalExposure}, 추가: ${input.amount}, 한도: ${maxExposure})` };
    }

    // 6. 단일 포지션 비율 확인
    const maxPositionSize = this.config["max-total-capital"] * this.config["max-position-ratio"];
    const existingPosition = this.positionRepo.findBySymbol(input.market_type, input.via, input.symbol);
    const positionTotal = (existingPosition ? existingPosition.quantity * existingPosition.avg_entry_price : 0) + input.amount;
    if (positionTotal > maxPositionSize) {
      this.eventRepo.log("rejected", `포지션 비율 초과: ${positionTotal} > ${maxPositionSize}`);
      return { approved: false, reason: `단일 포지션 비율 한도 초과 (${positionTotal} > ${maxPositionSize})` };
    }

    return { approved: true };
  }

  recordLoss(): void {
    this.consecutiveLosses++;
    if (this.consecutiveLosses >= this.config["circuit-breaker"]["consecutive-losses"]) {
      this.activateCircuitBreaker();
    }
  }

  recordWin(): void {
    this.consecutiveLosses = 0;
  }

  activateCircuitBreaker(): void {
    this.circuitBreakerActive = true;
    this.circuitBreakerUntil = new Date(Date.now() + this.config["circuit-breaker"]["cooldown-minutes"] * 60 * 1000);
    this.eventRepo.log("circuit_breaker", `서킷 브레이커 활성화. 해제 시각: ${this.circuitBreakerUntil.toISOString()}`);
  }

  resetCircuitBreaker(): void {
    this.circuitBreakerActive = false;
    this.circuitBreakerUntil = null;
    this.consecutiveLosses = 0;
  }

  isCircuitBreakerActive(): boolean {
    if (!this.circuitBreakerActive) return false;
    if (this.circuitBreakerUntil && new Date() > this.circuitBreakerUntil) {
      this.resetCircuitBreaker();
      return false;
    }
    return true;
  }

  status(): { circuitBreaker: boolean; consecutiveLosses: number; circuitBreakerUntil: string | null } {
    return {
      circuitBreaker: this.isCircuitBreakerActive(),
      consecutiveLosses: this.consecutiveLosses,
      circuitBreakerUntil: this.circuitBreakerUntil?.toISOString() ?? null,
    };
  }
}
```

**Step 4: 테스트 통과 확인**

```bash
pnpm test src/risk/manager.test.ts
```

Expected: PASS

**Step 5: 커밋**

```bash
git add src/risk/
git commit -m "feat: 리스크 매니저 (5단계 체크, 서킷 브레이커)"
```

---

## Phase 3: Exchange Adapters

### Task 5: Exchange 공통 인터페이스

**Files:**
- Create: `src/exchanges/types.ts`

**Step 1: 공통 인터페이스 정의**

`src/exchanges/types.ts`:
```typescript
export interface Ticker {
  symbol: string;
  price: number;
  change: number;
  changeRate: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface OrderbookEntry {
  price: number;
  size: number;
}

export interface Orderbook {
  symbol: string;
  asks: OrderbookEntry[];
  bids: OrderbookEntry[];
  timestamp: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Balance {
  currency: string;
  available: number;
  locked: number;
  avgBuyPrice?: number;
}

export interface OrderRequest {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  amount: number;
  price?: number;
}

export interface OrderResponse {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  status: "pending" | "filled" | "partially_filled" | "cancelled";
  amount: number;
  price: number | null;
  filledAmount: number;
  filledPrice: number | null;
  createdAt: string;
}

export interface Exchange {
  name: string;
  getPrice(symbol: string): Promise<Ticker>;
  getOrderbook(symbol: string): Promise<Orderbook>;
  getCandles(symbol: string, interval: string, count?: number): Promise<Candle[]>;
  getBalance(): Promise<Balance[]>;
  placeOrder(order: OrderRequest): Promise<OrderResponse>;
  cancelOrder(orderId: string): Promise<OrderResponse>;
  getOrder(orderId: string): Promise<OrderResponse>;
  getOpenOrders(symbol?: string): Promise<OrderResponse[]>;
}
```

**Step 2: 커밋**

```bash
git add src/exchanges/types.ts
git commit -m "feat: exchange 공통 인터페이스 정의"
```

---

### Task 6: Upbit 어댑터

**Files:**
- Create: `src/exchanges/upbit/auth.ts`
- Create: `src/exchanges/upbit/auth.test.ts`
- Create: `src/exchanges/upbit/client.ts`
- Create: `src/exchanges/upbit/client.test.ts`

**Step 1: JWT 인증 테스트 작성**

`src/exchanges/upbit/auth.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { createUpbitToken } from "./auth.js";

describe("Upbit auth", () => {
  it("쿼리 없이 JWT 토큰을 생성한다", () => {
    const token = createUpbitToken("test-access-key", "test-secret-key");
    expect(token).toMatch(/^eyJ/); // JWT 형식
  });

  it("쿼리 파라미터 포함 JWT 토큰을 생성한다", () => {
    const token = createUpbitToken("test-access-key", "test-secret-key", "market=KRW-BTC&side=bid");
    expect(token).toMatch(/^eyJ/);
  });
});
```

**Step 2: 테스트 실행하여 실패 확인**

```bash
pnpm test src/exchanges/upbit/auth.test.ts
```

**Step 3: auth 구현**

`src/exchanges/upbit/auth.ts` — JWT HS256 서명, SHA512 query hash:

```typescript
import { createHmac, createHash, randomUUID } from "node:crypto";

function base64url(data: string): string {
  return Buffer.from(data).toString("base64url");
}

export function createUpbitToken(accessKey: string, secretKey: string, queryString?: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

  const payload: Record<string, string> = {
    access_key: accessKey,
    nonce: randomUUID(),
  };

  if (queryString) {
    const queryHash = createHash("sha512").update(queryString, "utf-8").digest("hex");
    payload.query_hash = queryHash;
    payload.query_hash_alg = "SHA512";
  }

  const payloadEncoded = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secretKey)
    .update(`${header}.${payloadEncoded}`)
    .digest("base64url");

  return `${header}.${payloadEncoded}.${signature}`;
}
```

**Step 4: 테스트 통과 확인 후 클라이언트 테스트 작성**

`src/exchanges/upbit/client.test.ts` — HTTP 모킹 기반 테스트:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpbitExchange } from "./client.js";

// undici fetch를 모킹하여 실제 API 호출 없이 테스트
describe("UpbitExchange", () => {
  let exchange: UpbitExchange;

  beforeEach(() => {
    exchange = new UpbitExchange("test-key", "test-secret");
  });

  it("getPrice가 Ticker를 반환한다 (모킹)", async () => {
    const mockResponse = [{
      market: "KRW-BTC",
      trade_price: 133000000,
      signed_change_price: 1500000,
      signed_change_rate: 0.0114,
      acc_trade_volume_24h: 1700,
      high_price: 135000000,
      low_price: 131000000,
      timestamp: Date.now(),
    }];

    vi.spyOn(exchange as any, "fetchPublic").mockResolvedValue(mockResponse);

    const ticker = await exchange.getPrice("BTC-KRW");
    expect(ticker.symbol).toBe("BTC-KRW");
    expect(ticker.price).toBe(133000000);
  });

  it("placeOrder가 주문 응답을 반환한다 (모킹)", async () => {
    const mockResponse = {
      uuid: "test-uuid-123",
      side: "bid",
      ord_type: "price",
      price: "100000",
      state: "wait",
      market: "KRW-BTC",
      volume: null,
      remaining_volume: null,
      executed_volume: "0.0",
      created_at: "2026-03-08T15:00:00+09:00",
    };

    vi.spyOn(exchange as any, "fetchPrivate").mockResolvedValue(mockResponse);

    const order = await exchange.placeOrder({
      symbol: "BTC-KRW", side: "buy", type: "market", amount: 100000,
    });
    expect(order.id).toBe("test-uuid-123");
    expect(order.side).toBe("buy");
  });
});
```

**Step 5: Upbit 클라이언트 구현**

`src/exchanges/upbit/client.ts`:
```typescript
import { createUpbitToken } from "./auth.js";
import type { Exchange, Ticker, Orderbook, Candle, Balance, OrderRequest, OrderResponse } from "../types.js";

const BASE_URL = "https://api.upbit.com";

export class UpbitExchange implements Exchange {
  name = "upbit";

  constructor(
    private accessKey: string,
    private secretKey: string,
  ) {}

  private async fetchPublic(path: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, BASE_URL);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Upbit API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  private async fetchPrivate(method: string, path: string, params?: Record<string, string>, body?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, BASE_URL);
    let queryString: string | undefined;

    if (method === "GET" || method === "DELETE") {
      if (params) {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        queryString = url.searchParams.toString();
      }
    } else if (body) {
      queryString = new URLSearchParams(body).toString();
    }

    const token = createUpbitToken(this.accessKey, this.secretKey, queryString);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    const options: RequestInit = { method, headers };
    if (method === "POST" && body) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url.toString(), options);
    if (!res.ok) throw new Error(`Upbit API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async getPrice(symbol: string): Promise<Ticker> {
    const market = this.toMarket(symbol);
    const data = await this.fetchPublic("/v1/ticker", { markets: market }) as any[];
    const t = data[0];
    return {
      symbol,
      price: t.trade_price,
      change: t.signed_change_price,
      changeRate: t.signed_change_rate,
      volume24h: t.acc_trade_volume_24h,
      high24h: t.high_price,
      low24h: t.low_price,
      timestamp: t.timestamp,
    };
  }

  async getOrderbook(symbol: string): Promise<Orderbook> {
    const market = this.toMarket(symbol);
    const data = await this.fetchPublic("/v1/orderbook", { markets: market }) as any[];
    const ob = data[0];
    return {
      symbol,
      asks: ob.orderbook_units.map((u: any) => ({ price: u.ask_price, size: u.ask_size })),
      bids: ob.orderbook_units.map((u: any) => ({ price: u.bid_price, size: u.bid_size })),
      timestamp: ob.timestamp,
    };
  }

  async getCandles(symbol: string, interval: string, count = 50): Promise<Candle[]> {
    const market = this.toMarket(symbol);
    const unit = this.parseInterval(interval);
    const path = unit.type === "minutes" ? `/v1/candles/minutes/${unit.value}` : `/v1/candles/${unit.type}`;
    const data = await this.fetchPublic(path, { market, count: String(count) }) as any[];
    return data.map((c: any) => ({
      timestamp: c.timestamp,
      open: c.opening_price,
      high: c.high_price,
      low: c.low_price,
      close: c.trade_price,
      volume: c.candle_acc_trade_volume,
    }));
  }

  async getBalance(): Promise<Balance[]> {
    const data = await this.fetchPrivate("GET", "/v1/accounts") as any[];
    return data.map((a: any) => ({
      currency: a.currency,
      available: parseFloat(a.balance),
      locked: parseFloat(a.locked),
      avgBuyPrice: parseFloat(a.avg_buy_price),
    }));
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    const market = this.toMarket(order.symbol);
    const body: Record<string, string> = {
      market,
      side: order.side === "buy" ? "bid" : "ask",
    };

    if (order.type === "market") {
      if (order.side === "buy") {
        body.ord_type = "price";
        body.price = String(order.amount);
      } else {
        body.ord_type = "market";
        body.volume = String(order.amount);
      }
    } else {
      body.ord_type = "limit";
      body.price = String(order.price!);
      body.volume = String(order.amount);
    }

    const data = await this.fetchPrivate("POST", "/v1/orders", undefined, body) as any;
    return this.toOrderResponse(data);
  }

  async cancelOrder(orderId: string): Promise<OrderResponse> {
    const data = await this.fetchPrivate("DELETE", "/v1/order", { uuid: orderId }) as any;
    return this.toOrderResponse(data);
  }

  async getOrder(orderId: string): Promise<OrderResponse> {
    const data = await this.fetchPrivate("GET", "/v1/order", { uuid: orderId }) as any;
    return this.toOrderResponse(data);
  }

  async getOpenOrders(symbol?: string): Promise<OrderResponse[]> {
    const params: Record<string, string> = {};
    if (symbol) params.market = this.toMarket(symbol);
    const data = await this.fetchPrivate("GET", "/v1/orders/open", params) as any[];
    return data.map((d: any) => this.toOrderResponse(d));
  }

  // KRW-BTC <-> BTC-KRW 변환 (Upbit는 KRW-BTC 형식 사용)
  private toMarket(symbol: string): string {
    const parts = symbol.split("-");
    if (parts.length !== 2) return symbol;
    // BTC-KRW -> KRW-BTC
    if (parts[1] === "KRW" || parts[1] === "BTC" || parts[1] === "USDT") {
      return `${parts[1]}-${parts[0]}`;
    }
    return symbol;
  }

  private toOrderResponse(data: any): OrderResponse {
    return {
      id: data.uuid,
      symbol: data.market,
      side: data.side === "bid" ? "buy" : "sell",
      type: data.ord_type === "limit" ? "limit" : "market",
      status: this.mapStatus(data.state),
      amount: parseFloat(data.volume ?? data.price ?? "0"),
      price: data.price ? parseFloat(data.price) : null,
      filledAmount: parseFloat(data.executed_volume ?? "0"),
      filledPrice: null,
      createdAt: data.created_at,
    };
  }

  private mapStatus(state: string): OrderResponse["status"] {
    switch (state) {
      case "wait": case "watch": return "pending";
      case "done": return "filled";
      case "cancel": return "cancelled";
      default: return "pending";
    }
  }

  private parseInterval(interval: string): { type: string; value: number } {
    const match = interval.match(/^(\d+)(m|h|d|w|M)$/);
    if (!match) return { type: "minutes", value: 60 };
    const [, num, unit] = match;
    switch (unit) {
      case "m": return { type: "minutes", value: parseInt(num) };
      case "h": return { type: "minutes", value: parseInt(num) * 60 };
      case "d": return { type: "days", value: parseInt(num) };
      case "w": return { type: "weeks", value: parseInt(num) };
      case "M": return { type: "months", value: parseInt(num) };
      default: return { type: "minutes", value: 60 };
    }
  }
}
```

**Step 6: 테스트 통과 확인**

```bash
pnpm test src/exchanges/upbit/
```

Expected: PASS

**Step 7: 커밋**

```bash
git add src/exchanges/
git commit -m "feat: Upbit 어댑터 (JWT 인증, REST 클라이언트)"
```

---

### Task 7: KIS 어댑터

**Files:**
- Create: `src/exchanges/kis/auth.ts`
- Create: `src/exchanges/kis/auth.test.ts`
- Create: `src/exchanges/kis/client.ts`
- Create: `src/exchanges/kis/client.test.ts`

구현 패턴은 Task 6(Upbit)과 동일하나 KIS 고유 사항:
- OAuth2 토큰 발급 (`POST /oauth2/tokenP`, 24시간 유효, 6시간마다 갱신)
- 실전/모의투자 Base URL 분리 (`openapi.koreainvestment.com:9443` vs `openapivts.koreainvestment.com:29443`)
- tr_id 헤더로 API 구분 (`TTTC0802U` 매수, `TTTC0801U` 매도, `VTTC*` 모의)
- hashkey 발급 필요 (주문 API)
- 종목코드 6자리 + 시장구분(`J`: 주식)

**KIS Exchange 인터페이스** — `Exchange`를 구현하되 `StockExchange` 추가 메서드:
```typescript
export interface StockExchange extends Exchange {
  getStockInfo(symbol: string): Promise<StockInfo>;
}
```

TDD 단계는 Task 6과 동일: auth 테스트 → auth 구현 → 클라이언트 테스트 → 클라이언트 구현 → 커밋

커밋 메시지: `feat: KIS 어댑터 (OAuth 인증, 주식 매매)`

---

### Task 8: Polymarket 어댑터

**Files:**
- Create: `src/exchanges/polymarket/client.ts`
- Create: `src/exchanges/polymarket/client.test.ts`

Polymarket 고유 사항:
- CLOB API (`https://clob.polymarket.com`)
- Polygon 네트워크 월렛 서명 (ethers.js 또는 viem 사용)
- 마켓 검색 (`GET /markets`), 마켓 상세 (`GET /markets/{id}`)
- 주문: CLOB order book에 limit order 또는 CTF split → CLOB sell
- USDC.e 기반 거래

**PredictionExchange 인터페이스** 추가 메서드:
```typescript
export interface PredictionExchange extends Exchange {
  searchMarkets(query: string): Promise<PredictionMarket[]>;
  getMarket(marketId: string): Promise<PredictionMarketDetail>;
  getPositions(): Promise<PredictionPosition[]>;
}
```

TDD 단계는 Task 6과 동일 패턴. 추가 의존성: `viem` (Polygon 월렛 서명)

커밋 메시지: `feat: Polymarket 어댑터 (CLOB API, Polygon 서명)`

---

## Phase 4: CLI Commands

### Task 9: Exchange 레지스트리 + CLI 기반 구조

**Files:**
- Create: `src/exchanges/registry.ts`
- Create: `src/exchanges/registry.test.ts`
- Modify: `src/index.ts`

**Step 1: 레지스트리 테스트**

`src/exchanges/registry.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { ExchangeRegistry } from "./registry.js";

describe("ExchangeRegistry", () => {
  it("등록된 거래소를 반환한다", () => {
    const registry = new ExchangeRegistry();
    const mockExchange = { name: "upbit" } as any;
    registry.register("cex", "upbit", mockExchange);
    expect(registry.get("cex", "upbit")).toBe(mockExchange);
  });

  it("등록되지 않은 거래소 조회 시 에러를 던진다", () => {
    const registry = new ExchangeRegistry();
    expect(() => registry.get("cex", "binance")).toThrow("등록되지 않은");
  });
});
```

**Step 2: 레지스트리 구현**

`src/exchanges/registry.ts`:
```typescript
import type { Exchange } from "./types.js";

export class ExchangeRegistry {
  private exchanges = new Map<string, Exchange>();

  register(marketType: string, name: string, exchange: Exchange): void {
    this.exchanges.set(`${marketType}:${name}`, exchange);
  }

  get(marketType: string, name: string): Exchange {
    const key = `${marketType}:${name}`;
    const exchange = this.exchanges.get(key);
    if (!exchange) throw new Error(`등록되지 않은 거래소: ${key}`);
    return exchange;
  }
}
```

**Step 3: 커밋**

```bash
git add src/exchanges/registry.ts src/exchanges/registry.test.ts
git commit -m "feat: exchange 레지스트리"
```

---

### Task 10: config CLI 명령어

**Files:**
- Create: `src/commands/config.ts`

```bash
trade config init     # ~/.trade-cli/config.yaml 생성
trade config show     # 현재 설정 출력 (API 키는 마스킹)
trade config set <key> <value>
```

TDD: 테스트 → 구현 → 커밋

커밋: `feat: config CLI 명령어 (init, show, set)`

---

### Task 11: cex CLI 명령어

**Files:**
- Create: `src/commands/cex.ts`

```bash
trade cex price <symbol> --via <exchange>
trade cex orderbook <symbol> --via <exchange>
trade cex candles <symbol> --via <exchange> [--interval 1h]
trade cex balance --via <exchange>
trade cex buy <symbol> <amount> --via <exchange> [--type limit --price <p>]
trade cex sell <symbol> <amount> --via <exchange> [--type limit --price <p>]
trade cex cancel <order-id> --via <exchange>
```

주문 명령(buy/sell)은 리스크 매니저를 자동 호출하여 체크 후 실행.

TDD: 테스트 → 구현 → 커밋

커밋: `feat: cex CLI 명령어`

---

### Task 12: stock CLI 명령어

**Files:**
- Create: `src/commands/stock.ts`

```bash
trade stock price <symbol> --via <broker>
trade stock balance --via <broker>
trade stock buy <symbol> <amount> --via <broker>
trade stock sell <symbol> <amount> --via <broker>
trade stock cancel <order-id> --via <broker>
trade stock info <symbol> --via <broker>
```

TDD: 테스트 → 구현 → 커밋

커밋: `feat: stock CLI 명령어`

---

### Task 13: prediction CLI 명령어

**Files:**
- Create: `src/commands/prediction.ts`

```bash
trade prediction markets --via <platform> [--query <keyword>]
trade prediction market <market-id> --via <platform>
trade prediction buy <market-id> <outcome> <amount> --via <platform>
trade prediction sell <market-id> <outcome> <amount> --via <platform>
trade prediction positions --via <platform>
```

TDD: 테스트 → 구현 → 커밋

커밋: `feat: prediction CLI 명령어`

---

### Task 14: risk CLI 명령어

**Files:**
- Create: `src/commands/risk.ts`

```bash
trade risk check <market-type> <symbol> <amount> --via <exchange>
trade risk status
trade risk set <key> <value>
trade risk reset-circuit-breaker
```

TDD: 테스트 → 구현 → 커밋

커밋: `feat: risk CLI 명령어`

---

### Task 15: position + history CLI 명령어

**Files:**
- Create: `src/commands/position.ts`
- Create: `src/commands/history.ts`

```bash
trade position summary
trade history list [--via <exchange>] [--from <date>] [--limit <n>]
trade history stats [--period <duration>]
trade history export [--format csv]
```

TDD: 테스트 → 구현 → 커밋

커밋: `feat: position, history CLI 명령어`

---

## Phase 5: Monitor Daemon

### Task 16: 손절매 모니터

**Files:**
- Create: `src/monitor/runner.ts`
- Create: `src/monitor/runner.test.ts`

30초 간격으로 보유 포지션의 현재가를 조회, stop-loss 기준 초과 시 자동 시장가 매도.

TDD: 테스트 → 구현 → 커밋

커밋: `feat: 손절매 모니터 러너`

---

### Task 17: LaunchAgent 통합

**Files:**
- Create: `src/monitor/launchd.ts`
- Create: `src/commands/monitor.ts`

```bash
trade monitor install     # ~/Library/LaunchAgents/com.trade-cli.monitor.plist 생성 + load
trade monitor uninstall   # unload + plist 삭제
trade monitor start       # launchctl kickstart
trade monitor stop        # launchctl kill
trade monitor status      # launchctl print
```

TDD: 테스트 → 구현 → 커밋

커밋: `feat: LaunchAgent 모니터 통합`

---

## 의존 관계

```
Task 1 (스캐폴딩)
  └→ Task 2 (Config)
      └→ Task 3 (Database)
          └→ Task 4 (Risk Manager)
              └→ Task 5 (Exchange 인터페이스)
                  ├→ Task 6 (Upbit) ─────┐
                  ├→ Task 7 (KIS) ───────┼→ Task 9 (Registry)
                  └→ Task 8 (Polymarket) ┘     │
                                               ├→ Task 10 (config CLI)
                                               ├→ Task 11 (cex CLI)
                                               ├→ Task 12 (stock CLI)
                                               ├→ Task 13 (prediction CLI)
                                               ├→ Task 14 (risk CLI)
                                               └→ Task 15 (position/history CLI)
                                                    └→ Task 16 (Monitor)
                                                        └→ Task 17 (LaunchAgent)
```

Task 6, 7, 8은 독립적으로 병렬 구현 가능.
Task 10~15도 Registry 이후 독립적으로 병렬 구현 가능.
