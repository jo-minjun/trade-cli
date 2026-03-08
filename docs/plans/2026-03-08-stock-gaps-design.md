# Stock Feature Gaps Design

## Overview

Fill three implementation gaps in the stock (KIS) trading feature to achieve feature parity with CEX commands.

## Gap 1: KIS `getOrder()` / `getOpenOrders()` Implementation

Currently both methods are stubs. Use KIS "일별주문체결조회" API to implement them.

### API Details

```
GET /uapi/domestic-stock/v1/trading/inquire-daily-ccld
tr_id: TTTC8001R (production) / VTTC8001R (mock)
```

### Implementation

- **`getOpenOrders(symbol?)`** — Call API, filter orders where `ord_qty > tot_ccld_qty` (unfilled). Optionally filter by symbol.
- **`getOrder(orderId)`** — Call same API, find order where `odno === orderId`. Map response to `OrderResponse` with filled amount/price.

### Response Mapping

| KIS Field | OrderResponse Field |
|-----------|-------------------|
| `odno` | `id` |
| `pdno` | `symbol` |
| `sll_buy_dvsn_cd` | `side` ("01"=sell, "02"=buy) |
| `ord_dvsn_cd` | `type` ("01"=market, "00"=limit) |
| `ord_qty` | `amount` |
| `ord_unpr` | `price` |
| `tot_ccld_qty` | `filledAmount` |
| `avg_prvs` | `filledPrice` |
| `ord_dt` + `ord_tmd` | `createdAt` |

### Status Derivation

- `tot_ccld_qty == 0` → `"pending"`
- `0 < tot_ccld_qty < ord_qty` → `"partially_filled"`
- `tot_ccld_qty == ord_qty` → `"filled"`

## Gap 2: waitForFill + Cancel DB Sync

### waitForFill for Stock

Apply existing `waitForFill` helper to stock buy/sell commands, same pattern as CEX:

1. Place order → get `OrderResponse`
2. If status is not `filled`/`partially_filled`, poll via `getOrder()`
3. Update `orderRepo` with fill info

### OrderRepository.findByExternalId

Add `findByExternalId(externalId: string): OrderRow | undefined` to `OrderRepository`.

### Cancel DB Sync

In `stock cancel` command:
1. Call `exchange.cancelOrder(orderId)`
2. Look up internal order via `orderRepo.findByExternalId(orderId)`
3. If found, call `orderRepo.updateStatus(internalId, 'cancelled')`

Apply same fix to `cex cancel` command (same TODO exists there).

## Gap 3: CLI Subcommands

### `stock orders`

Same format as `cex orders`:
```
Open Orders:
  <id> | BUY/SELL <symbol> | market/limit | amount: <n> @ <price>
```

### `stock candles`

Same format as `cex candles`:
```
<symbol> Candles (<interval>)
  <date> | O:<open> H:<high> L:<low> C:<close> V:<volume>
```

Note: KIS only supports daily candles. If interval is not "1d"/"D", log a warning that only daily candles are available.
