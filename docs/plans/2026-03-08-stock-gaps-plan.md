# Stock Feature Gaps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fill three implementation gaps in stock (KIS) trading to achieve feature parity with CEX commands.

**Architecture:** Implement KIS daily order inquiry API for `getOrder()`/`getOpenOrders()`, add `findByExternalId` to `OrderRepository`, wire `waitForFill` into stock buy/sell, sync cancel status to DB, and expose `orders`/`candles` CLI subcommands.

**Tech Stack:** TypeScript, Vitest, Commander.js, KIS OpenAPI

---

### Task 1: Implement `getOrder()` with KIS daily order inquiry API

**Files:**
- Modify: `src/exchanges/kis/client.ts:233-246` (replace stub)
- Modify: `src/exchanges/kis/auth.ts:68-73` (add inquiry tr_id helper)
- Test: `src/exchanges/kis/client.test.ts`

**Step 1: Write the failing test for `getOrder`**

Add to `src/exchanges/kis/client.test.ts`:

```typescript
it("getOrder returns order status (mocked)", async () => {
  const mockResponse = {
    output1: [
      {
        odno: "00001",
        pdno: "005930",
        sll_buy_dvsn_cd: "02",
        ord_dvsn_cd: "01",
        ord_qty: "10",
        ord_unpr: "0",
        tot_ccld_qty: "10",
        avg_prvs: "70000",
        ord_dt: "20260308",
        ord_tmd: "100000",
      },
      {
        odno: "00002",
        pdno: "005930",
        sll_buy_dvsn_cd: "01",
        ord_dvsn_cd: "00",
        ord_qty: "5",
        ord_unpr: "71000",
        tot_ccld_qty: "0",
        avg_prvs: "0",
        ord_dt: "20260308",
        ord_tmd: "100100",
      },
    ],
  };

  vi.spyOn(exchange as any, "fetchApi").mockResolvedValue(mockResponse);

  const order = await exchange.getOrder("00001");
  expect(order.id).toBe("00001");
  expect(order.symbol).toBe("005930");
  expect(order.side).toBe("buy");
  expect(order.type).toBe("market");
  expect(order.status).toBe("filled");
  expect(order.filledAmount).toBe(10);
  expect(order.filledPrice).toBe(70000);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/exchanges/kis/client.test.ts --reporter=verbose`
Expected: FAIL — current stub returns hardcoded dummy data

**Step 3: Add `getInquiryTrId()` to `KisAuth`**

In `src/exchanges/kis/auth.ts`, add after `getTradeId`:

```typescript
getInquiryTrId(): string {
  return this.config.isMock ? "VTTC8001R" : "TTTC8001R";
}
```

**Step 4: Implement `getOrder()` in `KisExchange`**

Replace the stub at `src/exchanges/kis/client.ts:233-246` with:

```typescript
async getOrder(orderId: string): Promise<OrderResponse> {
  const orders = await this.fetchDailyOrders();
  const found = orders.find((o) => o.id === orderId);
  if (!found) {
    return {
      id: orderId, symbol: "", side: "buy", type: "limit",
      status: "pending", amount: 0, price: null,
      filledAmount: 0, filledPrice: null, createdAt: new Date().toISOString(),
    };
  }
  return found;
}
```

Add the shared `fetchDailyOrders` private method:

```typescript
private async fetchDailyOrders(): Promise<OrderResponse[]> {
  const [acctPrefix, acctSuffix] = this.auth.accountNo.split("-");
  const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const params = new URLSearchParams({
    CANO: acctPrefix,
    ACNT_PRDT_CD: acctSuffix,
    INQR_STRT_DT: today,
    INQR_END_DT: today,
    SLL_BUY_DVSN_CD: "00",
    INQR_DVSN: "00",
    PDNO: "",
    CCLD_DVSN: "00",
    ORD_GNO_BRNO: "",
    ODNO: "",
    INQR_DVSN_3: "00",
    INQR_DVSN_1: "",
    CTX_AREA_FK100: "",
    CTX_AREA_NK100: "",
  });
  const data = (await this.fetchApi(
    "GET",
    `/uapi/domestic-stock/v1/trading/inquire-daily-ccld?${params}`,
    { tr_id: this.auth.getInquiryTrId() },
  )) as any;

  return (data.output1 || []).map((item: any) => {
    const ordQty = parseInt(item.ord_qty);
    const filledQty = parseInt(item.tot_ccld_qty);
    let status: string;
    if (filledQty === 0) status = "pending";
    else if (filledQty < ordQty) status = "partially_filled";
    else status = "filled";

    return {
      id: item.odno,
      symbol: item.pdno,
      side: item.sll_buy_dvsn_cd === "02" ? "buy" : "sell",
      type: item.ord_dvsn_cd === "01" ? "market" : "limit",
      status,
      amount: ordQty,
      price: parseInt(item.ord_unpr) || null,
      filledAmount: filledQty,
      filledPrice: parseInt(item.avg_prvs) || null,
      createdAt: `${item.ord_dt.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}T${item.ord_tmd.replace(/(\d{2})(\d{2})(\d{2})/, "$1:$2:$3")}`,
    } as OrderResponse;
  });
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/exchanges/kis/client.test.ts --reporter=verbose`
Expected: PASS

**Step 6: Commit**

```
feat: implement KIS getOrder with daily order inquiry API
```

---

### Task 2: Implement `getOpenOrders()` with KIS daily order inquiry API

**Files:**
- Modify: `src/exchanges/kis/client.ts:249-251` (replace stub)
- Test: `src/exchanges/kis/client.test.ts`

**Step 1: Write the failing test for `getOpenOrders`**

Add to `src/exchanges/kis/client.test.ts`:

```typescript
it("getOpenOrders returns unfilled orders (mocked)", async () => {
  const mockResponse = {
    output1: [
      {
        odno: "00001", pdno: "005930", sll_buy_dvsn_cd: "02",
        ord_dvsn_cd: "01", ord_qty: "10", ord_unpr: "0",
        tot_ccld_qty: "10", avg_prvs: "70000",
        ord_dt: "20260308", ord_tmd: "100000",
      },
      {
        odno: "00002", pdno: "005930", sll_buy_dvsn_cd: "01",
        ord_dvsn_cd: "00", ord_qty: "5", ord_unpr: "71000",
        tot_ccld_qty: "0", avg_prvs: "0",
        ord_dt: "20260308", ord_tmd: "100100",
      },
    ],
  };

  vi.spyOn(exchange as any, "fetchApi").mockResolvedValue(mockResponse);

  const orders = await exchange.getOpenOrders();
  expect(orders).toHaveLength(1);
  expect(orders[0].id).toBe("00002");
  expect(orders[0].status).toBe("pending");
});

it("getOpenOrders filters by symbol (mocked)", async () => {
  const mockResponse = {
    output1: [
      {
        odno: "00001", pdno: "005930", sll_buy_dvsn_cd: "02",
        ord_dvsn_cd: "00", ord_qty: "10", ord_unpr: "70000",
        tot_ccld_qty: "0", avg_prvs: "0",
        ord_dt: "20260308", ord_tmd: "100000",
      },
      {
        odno: "00002", pdno: "000660", sll_buy_dvsn_cd: "02",
        ord_dvsn_cd: "00", ord_qty: "5", ord_unpr: "50000",
        tot_ccld_qty: "0", avg_prvs: "0",
        ord_dt: "20260308", ord_tmd: "100100",
      },
    ],
  };

  vi.spyOn(exchange as any, "fetchApi").mockResolvedValue(mockResponse);

  const orders = await exchange.getOpenOrders("005930");
  expect(orders).toHaveLength(1);
  expect(orders[0].symbol).toBe("005930");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/exchanges/kis/client.test.ts --reporter=verbose`
Expected: FAIL — current stub returns empty array

**Step 3: Implement `getOpenOrders()`**

Replace the stub at `src/exchanges/kis/client.ts:249-251` with:

```typescript
async getOpenOrders(symbol?: string): Promise<OrderResponse[]> {
  const orders = await this.fetchDailyOrders();
  return orders.filter((o) => {
    const isOpen = o.status === "pending" || o.status === "partially_filled";
    if (symbol) return isOpen && o.symbol === symbol;
    return isOpen;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/exchanges/kis/client.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```
feat: implement KIS getOpenOrders with daily order inquiry API
```

---

### Task 3: Add `findByExternalId` to `OrderRepository`

**Files:**
- Modify: `src/db/repository.ts` (add method to `OrderRepository`)
- Test: Create test inline or in existing test file

**Step 1: Write the failing test**

Check if a repository test file exists, otherwise add to a suitable location. Add:

```typescript
it("findByExternalId returns order by external_id", () => {
  const id = orderRepo.create({
    market_type: "stock", via: "kis", symbol: "005930",
    side: "buy", type: "market", amount: 10, external_id: "EXT123",
  });
  const found = orderRepo.findByExternalId("EXT123");
  expect(found).toBeDefined();
  expect(found!.id).toBe(id);
  expect(found!.external_id).toBe("EXT123");
});

it("findByExternalId returns undefined for missing id", () => {
  const found = orderRepo.findByExternalId("NONEXISTENT");
  expect(found).toBeUndefined();
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — `findByExternalId` does not exist on `OrderRepository`

**Step 3: Implement `findByExternalId`**

Add to `OrderRepository` class in `src/db/repository.ts` after `findById`:

```typescript
findByExternalId(externalId: string): OrderRow | undefined {
  return this.db
    .prepare("SELECT * FROM orders WHERE external_id = ?")
    .get(externalId) as OrderRow | undefined;
}
```

**Step 4: Run test to verify it passes**

Expected: PASS

**Step 5: Commit**

```
feat: add OrderRepository.findByExternalId
```

---

### Task 4: Wire `waitForFill` into stock buy/sell commands

**Files:**
- Modify: `src/commands/stock.ts:89-108` (buy action)
- Modify: `src/commands/stock.ts:139-158` (sell action)
- Modify: `src/commands/stock.ts:1` (import `waitForFill`)

**Step 1: Update import**

In `src/commands/stock.ts:8`, change:

```typescript
import { withErrorHandling, updatePositionAfterOrder } from "./helpers.js";
```

to:

```typescript
import { withErrorHandling, updatePositionAfterOrder, waitForFill } from "./helpers.js";
```

**Step 2: Add waitForFill to buy action**

In the buy action, after `orderRepo.create(...)` (line ~105) and before `updatePositionAfterOrder`, add the polling logic matching CEX pattern:

```typescript
// Poll for fill status
if (order.status !== "filled" && order.status !== "partially_filled") {
  order = await waitForFill(exchange, order.id);
  if (order.status === "filled" || order.status === "partially_filled") {
    orderRepo.updateStatus(internalId, order.status, {
      filled_amount: order.filledAmount,
      filled_price: order.filledPrice ?? 0,
    });
  }
}
```

Note: `order` must be `let` (not `const`), and `orderRepo.create()` return value must be captured as `internalId`.

Current stock buy stores `orderRepo.create(...)` without capturing the return value. Change:

```typescript
orderRepo.create({...});
```

to:

```typescript
const internalId = orderRepo.create({...});
```

**Step 3: Add waitForFill to sell action**

Same pattern as buy. Change `orderRepo.create(...)` to capture `internalId`, add polling block before `updatePositionAfterOrder`.

**Step 4: Run all tests**

Run: `npx vitest run --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```
feat: add waitForFill to stock buy/sell commands
```

---

### Task 5: Cancel DB sync for stock and cex

**Files:**
- Modify: `src/commands/stock.ts:166-172` (cancel action)
- Modify: `src/commands/cex.ts:256-262` (cancel action — same TODO exists)

**Step 1: Update stock cancel action**

Replace the cancel action body in `src/commands/stock.ts`:

```typescript
.action(withErrorHandling(async (orderId: string, opts: { via: string }) => {
  const exchange = registry.get("stock", opts.via);
  const result = await exchange.cancelOrder(orderId);
  const internalOrder = orderRepo.findByExternalId(orderId);
  if (internalOrder) {
    orderRepo.updateStatus(internalOrder.id, "cancelled");
  }
  console.log(chalk.green("Order cancelled:"), result.id);
}));
```

**Step 2: Update cex cancel action**

Same change in `src/commands/cex.ts`:

```typescript
.action(withErrorHandling(async (orderId: string, opts: { via: string }) => {
  const exchange = registry.get("cex", opts.via);
  const result = await exchange.cancelOrder(orderId);
  const internalOrder = orderRepo.findByExternalId(orderId);
  if (internalOrder) {
    orderRepo.updateStatus(internalOrder.id, "cancelled");
  }
  console.log(chalk.green("Order cancelled:"), result.id);
}));
```

**Step 3: Run all tests**

Run: `npx vitest run --reporter=verbose`
Expected: PASS

**Step 4: Commit**

```
feat: sync cancel status to DB for stock and cex commands
```

---

### Task 6: Add `stock orders` CLI subcommand

**Files:**
- Modify: `src/commands/stock.ts` (add `orders` subcommand after `balance`)
- Modify: `src/commands/stock.test.ts` (verify subcommand registered)

**Step 1: Add test assertion**

In `src/commands/stock.test.ts`, add to the existing subcommands check:

```typescript
expect(subcommands).toContain("orders");
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/commands/stock.test.ts --reporter=verbose`
Expected: FAIL

**Step 3: Add `orders` subcommand**

In `src/commands/stock.ts`, after the `balance` subcommand block, add:

```typescript
cmd
  .command("orders")
  .description("List open orders")
  .option("--via <broker>", "Broker to use", config.stock["default-via"])
  .option("--symbol <symbol>", "Filter by stock code")
  .action(withErrorHandling(async (opts: { via: string; symbol?: string }) => {
    const exchange = registry.get("stock", opts.via);
    const orders = await exchange.getOpenOrders(opts.symbol);
    if (orders.length === 0) {
      console.log("No open orders");
      return;
    }
    console.log(chalk.bold("Open Orders:"));
    orders.forEach((o) => {
      console.log(
        `  ${o.id} | ${o.side.toUpperCase()} ${o.symbol} | ${o.type} | amount: ${o.amount}${o.price ? ` @ ${o.price}` : ""}`,
      );
    });
  }));
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/commands/stock.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```
feat: add stock orders CLI subcommand
```

---

### Task 7: Add `stock candles` CLI subcommand

**Files:**
- Modify: `src/commands/stock.ts` (add `candles` subcommand)
- Modify: `src/commands/stock.test.ts` (verify subcommand registered)

**Step 1: Add test assertion**

In `src/commands/stock.test.ts`, add:

```typescript
expect(subcommands).toContain("candles");
```

**Step 2: Run test to verify it fails**

Expected: FAIL

**Step 3: Add `candles` subcommand**

In `src/commands/stock.ts`, after the `orders` subcommand, add:

```typescript
cmd
  .command("candles")
  .description("Get candle data")
  .argument("<symbol>", "Stock code")
  .option("--via <broker>", "Broker to use", config.stock["default-via"])
  .option("--interval <interval>", "Candle interval (only daily supported)", "1d")
  .option("--count <count>", "Number of candles", "10")
  .action(
    withErrorHandling(async (
      symbol: string,
      opts: { via: string; interval: string; count: string },
    ) => {
      if (opts.interval !== "1d" && opts.interval !== "D") {
        console.log(chalk.yellow("Warning: KIS only supports daily candles. Showing daily data."));
      }
      const exchange = registry.get("stock", opts.via);
      const candles = await exchange.getCandles(
        symbol,
        opts.interval,
        parseInt(opts.count),
      );
      console.log(chalk.bold(`${symbol} Candles (daily)`));
      candles.forEach((c) => {
        const date = new Date(c.timestamp).toISOString().split("T")[0];
        console.log(
          `  ${date} | O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`,
        );
      });
    }),
  );
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/commands/stock.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 6: Commit**

```
feat: add stock candles CLI subcommand
```

---

### Task 8: Final verification and squash

**Step 1: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Squash commits**

Squash all task commits into a single commit:

```
feat: fill stock feature gaps (getOrder, getOpenOrders, cancel sync, orders/candles CLI)
```
