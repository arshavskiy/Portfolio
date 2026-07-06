# StockFolio — Math Reference

Index of every financial/mathematical calculation in the project. Two areas already have dedicated deep-dive docs — this file summarizes everything else and links out to those.

- [docs/buy-simulator-math.md](buy-simulator-math.md) — Buy/Sell simulator formulas (break-even price, target-average shares, leftover cash)
- [docs/momentum-signal.md](momentum-signal.md) — Watchlist momentum score, wave-pattern vote, badge thresholds

---

## Position Avg-Cost (weighted average, replay-based)

**File:** `server/controllers/portfolioController.js` — `recomputePosition()` (~line 15)

Replays every transaction for a ticker in date order, rebuilding `shares` and `avgCost` from scratch (not FIFO/LIFO):

- **Buy:** `totalCost += shares * price`, `totalShares += shares`
- **Sell:** `totalCost -= (totalCost / totalShares) * sharesSold`, `totalShares -= sharesSold` — removes cost basis proportional to the *current* weighted-average cost
- **Dividend (DRIP only):** treated as a buy at the dividend price. Cash dividends don't touch the position.
- Final: `avgCost = totalCost / totalShares`. Position is deleted if `totalShares <= 0`.

Called after every transaction edit/delete to guarantee consistency. The incremental single-step version used at transaction-creation time (buy/DRIP):

```
newAvgCost = (oldAvgCost * oldShares + price * newShares) / (oldShares + newShares)
```

---

## Fees & Capital Gains Tax

**File:** `server/controllers/feeProfileController.js`

### `calcFee(rule, total, shares)`
| Fee type | Formula |
|---|---|
| `percent` | `fee = total * rule.value` (e.g. `0.001` = 0.1%) |
| `perShare` | `fee = shares * rule.value` |
| `flat` | `fee = rule.value` |

Then: `if (fee < rule.minFee) fee = rule.minFee` (floor), rounded to cents: `round(fee * 100) / 100`.

Built-in "Blink Plus" profile: perShare $0.01/share, $1.50 minimum, 25% capital gains tax.

### `computeTransactionCosts(profile, txType, total, shares, price, avgCost)`
- Fee rule picked by side: `buyFee` for buys, `sellFee` for sells.
- Capital gains tax (sell only, only when profitable):
  ```
  gain = (price - avgCost) * shares
  taxAmount = gain > 0 ? round(gain * capitalGainsTax / 100 * 100) / 100 : 0
  ```

---

## Realized Gains

**File:** `server/controllers/portfolioController.js` — `getRealizedGains()` (~line 439)

Per-ticker running state `{shares, cost}` replayed chronologically (same avg-cost method as position recompute), emitting a gain event per sell:

```
avgCost    = state.cost / state.shares
costBasis  = avgCost * sharesSold
proceeds   = tx.total  (falls back to shares * price)
grossGain  = proceeds - costBasis
netGain    = grossGain - feePaid - taxPaid
```
State then updates: `state.cost -= costBasis`, `state.shares -= sharesSold`.

Cash dividends log their own gain event: `grossGain = netGain = tx.total`.

Results are grouped by year with `totalGross`, `totalNet`, `totalDividends` sums.

---

## Portfolio Totals & P&L

**File:** `server/controllers/portfolioController.js` — `getPortfolio()` (~line 91)

### Per position
```
value       = currentPrice * shares
cost        = avgCost * shares
pnl         = value - cost
pnlPercent  = cost > 0 ? (pnl / cost) * 100 : 0
dayPnl      = quoteChange * shares
fxRate      = currency === 'ILS' ? ilsToUsd : 1
valueUsd    = value * fxRate
```

### Per-currency totals
```
pnl            = value - cost
pnlPercent     = cost > 0 ? ((value - cost) / cost) * 100 : 0
dayPnlPercent  = value > 0 ? (dayPnl / (value - dayPnl)) * 100 : 0   // divides by prior-day value
```

### Combined USD totals
Same formulas applied to FX-converted sums — each position's `value`/`cost`/`dayPnl` is multiplied by its own `fxRate` before summing across currencies.

Client (`stores/portfolio.js`) stores these values verbatim from the API — no re-derivation on the client. `PortfolioStatsCard.vue` only divides by `ilsToUsd` to toggle the combined display between USD and ILS.

---

## Currency Conversion

**FX rate:** `server/services/stockService.js` — `getIlsToUsd()` (~line 1045). Fetches Yahoo's `ILS=X` quote (ILS per 1 USD) and inverts it: `rate = 1 / regularMarketPrice`. Cached 1 hour; falls back to `0.27` if the fetch fails.

**Ticker → currency:** `.TA` suffix → `'ILS'`, else `'USD'`. Duplicated in `server/controllers/portfolioController.js` (`tickerCurrency`) and `client/src/composables/useFormat.js`.

**Fee currency conversion:** `convertFeeToTransactionCurrency(amount, feeCurrency, transactionCurrency)`:
```
ILS fee → USD transaction:  amount * ilsToUsd
USD fee → ILS transaction:  amount / ilsToUsd
```
Used so `totalWithFees`/`netProceeds` display fees in the transaction's own currency.

**TASE price scaling:** `server/services/stockService.js` — `taFactor` divides `.TA` quote prices by 100 (Yahoo returns TASE prices in agorot, 1/100 shekel).

---

## Rebalancer

**File:** `client/src/views/RebalanceView.vue`

For each position, given a user-set target allocation %:
```
targetValueUsd  = totalPortfolioUsd * (targetPercent / 100)
currentValueUsd = shares * priceUsd
diffUsd         = targetValueUsd - currentValueUsd
priceUsd        = currency === 'ILS' ? currentPrice * ilsToUsd : currentPrice
sharesDelta     = priceUsd > 0 ? diffUsd / priceUsd : 0
action          = |sharesDelta| < 0.0001 ? 'hold' : (sharesDelta > 0 ? 'buy' : 'sell')
```
Actions are sorted by `|diffUsd|` descending (biggest rebalancing moves first). ILS positions are normalized to USD before computing the diff so all targets compare on the same basis.

"Equal weight" helper: `each = 100 / n` per position, with rounding remainder assigned to the first position so targets sum to exactly 100%.

---

## Key Files

| File | Role |
|---|---|
| `server/controllers/portfolioController.js` | Position recompute, portfolio totals, realized gains, currency helpers |
| `server/controllers/feeProfileController.js` | Fee & capital gains tax calculation |
| `server/services/stockService.js` | FX rate fetch, TASE price scaling |
| `client/src/composables/useFormat.js` | Ticker→currency mapping |
| `client/src/views/RebalanceView.vue` | Target-allocation buy/sell action plan |
| `client/src/stores/portfolio.js` | Client-side store of server-computed totals (no re-derivation) |
