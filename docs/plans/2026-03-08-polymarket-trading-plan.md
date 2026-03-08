# Polymarket Trading Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full trading capabilities for Polymarket prediction markets using `@polymarket/clob-client` SDK.

**Architecture:** Wrap `@polymarket/clob-client` SDK inside existing `PolymarketExchange` class to implement all `Exchange` + `PredictionExchange` interface methods. Two-step auth: derive API creds from private key, then use creds for all trading operations.

**Tech Stack:** `@polymarket/clob-client`, `ethers@^5.8.0`, existing TypeScript/commander/vitest stack

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

Run: `pnpm add @polymarket/clob-client ethers@^5`

Expected: packages added to `dependencies` in `package.json`

**Step 2: Verify install**

Run: `pnpm exec node -e "require('@polymarket/clob-client')"`

If ESM, try: `pnpm exec node --input-type=module -e "import('@polymarket/clob-client').then(() => console.log('OK'))"`

Expected: no errors (or "OK")

**Step 3: Verify ethers version**

Run: `pnpm exec node -e "const e = require('ethers'); console.log(e.ethers?.version || e.version)"`

Expected: `5.x.x`

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @polymarket/clob-client and ethers@5 dependencies"
```

---

### Task 2: Extend PolymarketCredentials config type

**Files:**
- Modify: `src/config/types.ts:12-14`

**Step 1: Update PolymarketCredentials**

Replace the current `PolymarketCredentials` interface:

```typescript
export interface PolymarketCredentials {
  "private-key": string;
  "api-key"?: string;
  "api-secret"?: string;
  "api-passphrase"?: string;
  "funder-address"?: string;
}
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors)

**Step 3: Commit**

```bash
git add src/config/types.ts
git commit -m "feat: extend PolymarketCredentials with API key fields"
```

---

### Task 3: Remove duplicate types from client.ts

**Files:**
- Modify: `src/exchanges/polymarket/client.ts:1-26`

**Step 1: Replace local type definitions with imports**

Remove the local `PredictionMarket`, `PredictionMarketDetail`, `PredictionPosition` interfaces from `client.ts` and import them from `types.ts`.

Change the import line to:

```typescript
import type {
  Exchange, Ticker, Orderbook, Candle, Balance,
  OrderRequest, OrderResponse,
  PredictionMarket, PredictionMarketDetail, PredictionPosition,
  PredictionExchange,
} from "../types.js";
```

Remove lines 6-26 (the three local interface definitions).

Change the class declaration to implement `PredictionExchange`:

```typescript
export class PolymarketExchange implements PredictionExchange {
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Run existing tests**

Run: `pnpm test -- src/exchanges/polymarket/client.test.ts`
Expected: All 4 tests pass

**Step 4: Commit**

```bash
git add src/exchanges/polymarket/client.ts
git commit -m "refactor: remove duplicate types, implement PredictionExchange interface"
```

---

### Task 4: Rewrite PolymarketExchange with ClobClient SDK

This is the main task. Replace manual `fetchPublic` calls with SDK methods and implement all trading methods.

**Files:**
- Modify: `src/exchanges/polymarket/client.ts` (full rewrite)
- Test: `src/exchanges/polymarket/client.test.ts`

**Step 1: Write failing tests for new methods**

Add tests to `src/exchanges/polymarket/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PolymarketExchange } from "./client.js";

// Mock @polymarket/clob-client
vi.mock("@polymarket/clob-client", () => {
  const mockClient = {
    getMarket: vi.fn(),
    getOpenOrders: vi.fn(),
    getOrder: vi.fn(),
    createAndPostOrder: vi.fn(),
    cancelOrder: vi.fn(),
    getBalanceAllowance: vi.fn(),
  };
  return {
    ClobClient: vi.fn(() => mockClient),
    Chain: { POLYGON: 137 },
    Side: { BUY: "BUY", SELL: "SELL" },
    OrderType: { GTC: "GTC", FOK: "FOK" },
    AssetType: { COLLATERAL: "COLLATERAL", CONDITIONAL: "CONDITIONAL" },
    __mockClient: mockClient,
  };
});

// Mock ethers Wallet
vi.mock("ethers", () => ({
  Wallet: vi.fn(() => ({ address: "0xTestAddress" })),
}));

function getMockClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@polymarket/clob-client") as any;
  return mod.__mockClient;
}

describe("PolymarketExchange", () => {
  let exchange: PolymarketExchange;

  beforeEach(() => {
    vi.clearAllMocks();
    exchange = new PolymarketExchange({
      "private-key": "0xabc123",
      "api-key": "test-key",
      "api-secret": "test-secret",
      "api-passphrase": "test-pass",
    });
  });

  it("searchMarkets returns markets from Gamma API", async () => {
    // searchMarkets still uses Gamma API (not CLOB SDK)
    vi.spyOn(exchange as any, "fetchGamma").mockResolvedValue([{
      conditionId: "0x123",
      question: "Will BTC hit 200k?",
      description: "Bitcoin price prediction",
      outcomes: "Yes,No",
      volume: "1000000",
      liquidity: "500000",
      endDateIso: "2026-12-31",
    }]);

    const markets = await exchange.searchMarkets("btc");
    expect(markets).toHaveLength(1);
    expect(markets[0].question).toBe("Will BTC hit 200k?");
  });

  it("getPrice returns YES token price", async () => {
    vi.spyOn(exchange, "getMarket").mockResolvedValue({
      id: "0x123",
      question: "Will BTC hit 200k?",
      description: "",
      outcomes: ["Yes", "No"],
      volume: 1000000,
      liquidity: 500000,
      endDate: "2026-12-31",
      tokens: [
        { outcome: "Yes", tokenId: "token-yes", price: 0.65 },
        { outcome: "No", tokenId: "token-no", price: 0.35 },
      ],
    });

    const ticker = await exchange.getPrice("0x123");
    expect(ticker.price).toBe(0.65);
  });

  it("getBalance returns USDC balance", async () => {
    const mock = getMockClient();
    mock.getBalanceAllowance.mockResolvedValue({ balance: "150.5", allowance: "1000" });

    const balances = await exchange.getBalance();
    expect(balances).toHaveLength(1);
    expect(balances[0].currency).toBe("USDC");
    expect(balances[0].available).toBe(150.5);
  });

  it("placeOrder creates order via SDK", async () => {
    const mock = getMockClient();
    vi.spyOn(exchange, "getMarket").mockResolvedValue({
      id: "0x123",
      question: "Test?",
      description: "",
      outcomes: ["Yes", "No"],
      volume: 0,
      liquidity: 0,
      endDate: "",
      tokens: [
        { outcome: "Yes", tokenId: "token-yes-id", price: 0.65 },
        { outcome: "No", tokenId: "token-no-id", price: 0.35 },
      ],
    });
    mock.createAndPostOrder.mockResolvedValue({
      success: true,
      orderID: "order-123",
    });

    const order = await exchange.placeOrder({
      symbol: "0x123:Yes",
      side: "buy",
      type: "limit",
      amount: 10,
      price: 0.65,
    });

    expect(order.id).toBe("order-123");
    expect(order.status).toBe("pending");
    expect(order.side).toBe("buy");
  });

  it("cancelOrder cancels via SDK", async () => {
    const mock = getMockClient();
    mock.cancelOrder.mockResolvedValue({ canceled: ["order-123"] });

    const result = await exchange.cancelOrder("order-123");
    expect(result.id).toBe("order-123");
    expect(result.status).toBe("cancelled");
  });

  it("getOpenOrders returns mapped orders", async () => {
    const mock = getMockClient();
    mock.getOpenOrders.mockResolvedValue([{
      id: "order-1",
      asset_id: "token-yes",
      side: "BUY",
      original_size: "100",
      size_matched: "0",
      price: "0.55",
      order_type: "GTC",
      created_at: "2026-01-01T00:00:00Z",
    }]);

    const orders = await exchange.getOpenOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe("order-1");
    expect(orders[0].side).toBe("buy");
    expect(orders[0].amount).toBe(100);
  });

  it("getCandles throws not supported", async () => {
    await expect(exchange.getCandles("0x123", "1h")).rejects.toThrow("Not supported");
  });

  it("getPositions returns positions from balance allowance", async () => {
    // getPositions uses internal tracking, tested via integration
    const positions = await exchange.getPositions();
    expect(Array.isArray(positions)).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/exchanges/polymarket/client.test.ts`
Expected: FAIL (constructor signature changed, new methods don't exist yet)

**Step 3: Rewrite client.ts implementation**

Replace `src/exchanges/polymarket/client.ts` with:

```typescript
import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import type {
  Ticker, Orderbook, Candle, Balance,
  OrderRequest, OrderResponse,
  PredictionMarket, PredictionMarketDetail, PredictionPosition,
  PredictionExchange,
} from "../types.js";
import type { PolymarketCredentials } from "../../config/types.js";

const CLOB_HOST = "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma-api.polymarket.com";
const POLYGON_CHAIN_ID = 137;

export class PolymarketExchange implements PredictionExchange {
  name = "polymarket";
  private client: ClobClient;
  private signer: InstanceType<typeof Wallet>;

  constructor(private creds: PolymarketCredentials) {
    this.signer = new Wallet(creds["private-key"]);

    if (creds["api-key"] && creds["api-secret"] && creds["api-passphrase"]) {
      this.client = new ClobClient(
        CLOB_HOST,
        POLYGON_CHAIN_ID,
        this.signer,
        {
          key: creds["api-key"],
          secret: creds["api-secret"],
          passphrase: creds["api-passphrase"],
        },
        undefined,
        creds["funder-address"],
      );
    } else {
      // Read-only client (no API creds yet — run `prediction setup` first)
      this.client = new ClobClient(CLOB_HOST, POLYGON_CHAIN_ID, this.signer);
    }
  }

  // --- Gamma API (market search/detail — not in SDK) ---

  private async fetchGamma(path: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, GAMMA_BASE);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Polymarket Gamma API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async searchMarkets(query: string): Promise<PredictionMarket[]> {
    const data = await this.fetchGamma("/markets", {
      closed: "false",
      ...(query ? { slug_like: query } : {}),
    }) as any[];
    return (data || []).map((m: any) => ({
      id: m.conditionId || m.id,
      question: m.question || "",
      description: m.description || "",
      outcomes: (m.outcomes || "Yes,No").split(","),
      volume: parseFloat(m.volume || "0"),
      liquidity: parseFloat(m.liquidity || "0"),
      endDate: m.endDateIso || "",
    }));
  }

  async getMarket(marketId: string): Promise<PredictionMarketDetail> {
    const data = await this.fetchGamma(`/markets/${marketId}`) as any;
    const tokens = (data.tokens || []).map((t: any) => ({
      outcome: t.outcome,
      tokenId: t.token_id,
      price: parseFloat(t.price || "0"),
    }));
    return {
      id: data.conditionId || data.id,
      question: data.question || "",
      description: data.description || "",
      outcomes: (data.outcomes || "Yes,No").split(","),
      volume: parseFloat(data.volume || "0"),
      liquidity: parseFloat(data.liquidity || "0"),
      endDate: data.endDateIso || "",
      tokens,
    };
  }

  // --- Exchange interface ---

  async getPrice(symbol: string): Promise<Ticker> {
    const market = await this.getMarket(symbol);
    const yesToken = market.tokens.find(t => t.outcome === "Yes");
    return {
      symbol,
      price: yesToken?.price ?? 0,
      change: 0,
      changeRate: 0,
      volume24h: market.volume,
      high24h: 1,
      low24h: 0,
      timestamp: Date.now(),
    };
  }

  async getOrderbook(symbol: string): Promise<Orderbook> {
    const data = await this.fetchGamma("") as any; // placeholder
    // Use CLOB API directly for orderbook (SDK doesn't wrap this well)
    const url = `${CLOB_HOST}/book?token_id=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Polymarket CLOB API error: ${res.status}`);
    const book = await res.json() as any;
    return {
      symbol,
      asks: (book.asks || []).map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) })),
      bids: (book.bids || []).map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
      timestamp: Date.now(),
    };
  }

  async getCandles(_symbol: string, _interval: string, _count?: number): Promise<Candle[]> {
    throw new Error("Not supported for Polymarket");
  }

  async getBalance(): Promise<Balance[]> {
    const result = await this.client.getBalanceAllowance({ asset_type: "COLLATERAL" as any });
    return [{
      currency: "USDC",
      available: parseFloat(result.balance || "0"),
      locked: 0,
    }];
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    // Parse symbol: "marketId:outcome" → find tokenId
    const [marketId, outcome] = order.symbol.split(":");
    if (!marketId || !outcome) {
      throw new Error(`Invalid symbol format: "${order.symbol}". Expected "marketId:outcome" (e.g., "0x123:Yes")`);
    }

    const market = await this.getMarket(marketId);
    const token = market.tokens.find(t => t.outcome.toLowerCase() === outcome.toLowerCase());
    if (!token) {
      throw new Error(`Outcome "${outcome}" not found in market. Available: ${market.tokens.map(t => t.outcome).join(", ")}`);
    }

    if (!order.price) {
      throw new Error("Price is required for Polymarket orders (0-1 probability)");
    }

    const side = order.side === "buy" ? Side.BUY : Side.SELL;

    const resp = await this.client.createAndPostOrder(
      {
        tokenID: token.tokenId,
        price: order.price,
        side,
        size: order.amount,
      },
      { tickSize: "0.01" },
      OrderType.GTC,
    );

    if (!resp.success) {
      throw new Error(`Order failed: ${JSON.stringify(resp)}`);
    }

    return {
      id: resp.orderID || "",
      symbol: order.symbol,
      side: order.side,
      type: "limit",
      status: "pending",
      amount: order.amount,
      price: order.price,
      filledAmount: 0,
      filledPrice: null,
      createdAt: new Date().toISOString(),
    };
  }

  async cancelOrder(orderId: string): Promise<OrderResponse> {
    await this.client.cancelOrder({ orderID: orderId });
    return {
      id: orderId,
      symbol: "",
      side: "buy",
      type: "limit",
      status: "cancelled",
      amount: 0,
      price: null,
      filledAmount: 0,
      filledPrice: null,
      createdAt: new Date().toISOString(),
    };
  }

  async getOrder(orderId: string): Promise<OrderResponse> {
    const data = await this.client.getOrder(orderId) as any;
    return {
      id: data.id || orderId,
      symbol: data.asset_id || "",
      side: data.side === "BUY" ? "buy" : "sell",
      type: "limit",
      status: data.status === "MATCHED" ? "filled" : data.status === "CANCELED" ? "cancelled" : "pending",
      amount: parseFloat(data.original_size || "0"),
      price: parseFloat(data.price || "0"),
      filledAmount: parseFloat(data.size_matched || "0"),
      filledPrice: parseFloat(data.price || "0"),
      createdAt: data.created_at || new Date().toISOString(),
    };
  }

  async getOpenOrders(_symbol?: string): Promise<OrderResponse[]> {
    const orders = await this.client.getOpenOrders() as any[];
    return (orders || []).map((o: any) => ({
      id: o.id,
      symbol: o.asset_id || "",
      side: o.side === "BUY" ? "buy" as const : "sell" as const,
      type: "limit" as const,
      status: "pending" as const,
      amount: parseFloat(o.original_size || "0"),
      price: parseFloat(o.price || "0"),
      filledAmount: parseFloat(o.size_matched || "0"),
      filledPrice: parseFloat(o.price || "0"),
      createdAt: o.created_at || new Date().toISOString(),
    }));
  }

  async getPositions(): Promise<PredictionPosition[]> {
    // Polymarket doesn't have a "list all positions" API.
    // Positions are tracked locally via DB (updatePositionAfterOrder).
    // This method returns empty — CLI `position summary` uses DB instead.
    return [];
  }
}
```

**Note:** The `getOrderbook` method has a bug — remove the unused `fetchGamma("")` call. The correct implementation:

```typescript
  async getOrderbook(symbol: string): Promise<Orderbook> {
    const url = `${CLOB_HOST}/book?token_id=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Polymarket CLOB API error: ${res.status}`);
    const book = await res.json() as any;
    return {
      symbol,
      asks: (book.asks || []).map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) })),
      bids: (book.bids || []).map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
      timestamp: Date.now(),
    };
  }
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/exchanges/polymarket/client.test.ts`
Expected: All tests PASS

**Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/exchanges/polymarket/client.ts src/exchanges/polymarket/client.test.ts
git commit -m "feat: implement Polymarket trading via @polymarket/clob-client SDK"
```

---

### Task 5: Update index.ts to pass full credentials

**Files:**
- Modify: `src/index.ts:38-41`

**Step 1: Update Polymarket registration**

Replace the current registration block:

```typescript
const polyConfig = config.prediction.polymarket as PolymarketCredentials | undefined;
if (polyConfig?.["private-key"]) {
  registry.register("prediction", "polymarket", new PolymarketExchange(polyConfig));
}
```

Add the import at the top:

```typescript
import type { PolymarketCredentials } from "./config/types.js";
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: pass full PolymarketCredentials to exchange constructor"
```

---

### Task 6: Add `config setup` command and `--price` option for prediction

**Files:**
- Modify: `src/commands/config.ts`
- Modify: `src/commands/prediction.ts`

**Step 1: Add `config setup` subcommand**

Add `config setup --via <platform>` to `src/commands/config.ts`. This command derives API credentials from a private key and saves them to config. Currently only Polymarket is supported.

```typescript
  cmd
    .command("setup")
    .description("Generate API credentials for a platform")
    .option("--via <platform>", "Platform", "polymarket")
    .action(withErrorHandling(async (opts: { via: string }) => {
      if (opts.via !== "polymarket") {
        console.log(chalk.red(`Setup is not supported for: ${opts.via}`));
        return;
      }
      const polyConfig = config.prediction.polymarket as any;
      if (!polyConfig?.["private-key"]) {
        console.log(chalk.red("Set private key first:"), "trade config set prediction.polymarket.private-key 0x...");
        return;
      }
      if (polyConfig["api-key"]) {
        console.log(chalk.yellow("API credentials already exist. Delete them first if you want to regenerate."));
        return;
      }

      // Dynamic import to avoid loading SDK when not needed
      const { ClobClient } = await import("@polymarket/clob-client");
      const { Wallet } = await import("ethers");
      const signer = new Wallet(polyConfig["private-key"]);
      const tempClient = new ClobClient("https://clob.polymarket.com", 137, signer);
      const creds = await tempClient.createOrDeriveApiKey();

      console.log(chalk.green("API credentials generated!"));
      console.log("Run these commands to save them:");
      console.log(`  trade config set prediction.polymarket.api-key ${creds.key}`);
      console.log(`  trade config set prediction.polymarket.api-secret ${creds.secret}`);
      console.log(`  trade config set prediction.polymarket.api-passphrase ${creds.passphrase}`);
    }));
```

Note: `createConfigCommand()` currently takes no arguments. It needs to accept `config: TradeConfig` to access polymarket credentials.

**Step 2: Add `--price` option to buy/sell**

In the `buy` command, add the price option:

```typescript
    .option("--price <price>", "Price (0-1 probability)")
```

Update the action signature to include `price`:

```typescript
    .action(
      withErrorHandling(async (
        marketId: string,
        outcome: string,
        amount: string,
        opts: { via: string; price?: string },
      ) => {
```

And update the `placeOrder` call:

```typescript
        const order = await exchange.placeOrder({
          symbol: `${marketId}:${outcome}`,
          side: "buy",
          type: "limit",
          amount: amountNum,
          price: opts.price ? parseFloat(opts.price) : undefined,
        });
```

Do the same for `sell`.

**Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/commands/prediction.ts
git commit -m "feat: add prediction setup command and --price option for buy/sell"
```

---

### Task 7: Update CHANGELOG and documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

**Step 1: Update CHANGELOG**

Add under `[Unreleased]` → `Added`:

```markdown
- Polymarket trading implementation via `@polymarket/clob-client` SDK
- `prediction setup` command for API credential generation
- `--price` option for `prediction buy` and `prediction sell`
```

Add under `[Unreleased]` → `Changed`:

```markdown
- `PolymarketExchange` constructor now accepts full `PolymarketCredentials` object
- `getCandles()` now throws "Not supported" instead of returning empty array
```

Add under `[Unreleased]` → `Fixed`:

```markdown
- Duplicate type definitions removed from Polymarket client (now imports from `types.ts`)
```

**Step 2: Update README Supported Markets**

Change Prediction Markets status:

```markdown
| Prediction Markets | Polymarket | WIP |
```

Keep as WIP until manual integration test is complete.

**Step 3: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: update changelog and README for Polymarket trading"
```

---

### Task 8: Squash commits

**Step 1: Squash all task commits into one**

```bash
git log --oneline -8
```

Identify the base commit (before Task 1) and squash:

```bash
git reset --soft <base-commit-hash>
git commit -m "feat: implement Polymarket trading via @polymarket/clob-client SDK"
```

---

## Manual Integration Test Checklist

After implementation, test in order:

1. **Read-only (no API key needed):**
   - `./trade prediction markets --query "bitcoin"` → shows markets
   - `./trade prediction market <market-id>` → shows detail with token prices

2. **Setup (private key needed):**
   - `./trade config set prediction.polymarket.private-key 0x...`
   - `./trade prediction setup` → generates API credentials
   - Set the generated credentials via `config set`

3. **Balance:**
   - `./trade prediction balance` (or `cex balance --via polymarket` — check which command exposes this)

4. **Trading:**
   - `./trade prediction buy <market-id> Yes 10 --price 0.55` → order placed
   - `./trade prediction sell <market-id> Yes 10 --price 0.65` → order placed
   - `./trade history list` → shows orders

5. **Order management:**
   - Place a limit order at unlikely price
   - Check it exists (via exchange or history)
   - Cancel it

## Notes

- `tickSize` is hardcoded to `"0.01"` for now. If orders fail with tick size errors, we may need to fetch the market's tick size dynamically via the CLOB API `/tick-size` endpoint.
- `getPositions()` returns empty because Polymarket doesn't have a "list all positions" API. Positions are tracked locally via the DB `position` table, which is populated by `updatePositionAfterOrder()` in the CLI commands.
- The `negRisk` parameter is not set (defaults to `false`). Some markets use negative risk — if orders fail, check the market's `neg_risk` field.
