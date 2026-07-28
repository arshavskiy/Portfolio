# Selling Stocks & Fee Calculation — Math Reference

Every calculation that fires when a stock is sold, plus the fee/tax engine shared by buys and sells. Live math (server-authoritative), not the what-if simulators — those live in [buy-simulator-math.md](buy-simulator-math.md).

Currency note: fees/tax are computed in the **fee profile's currency**, then converted to the **transaction's currency** for the stored `totalWithFees` / `netProceeds`. Position stays in native currency (`.TA` = ILS, else USD).

---

## 1. Fee engine — `calcFee(rule, total, shares)`

**File:** `server/controllers/feeProfileController.js:82`

```
percent   → fee = total * rule.value        (rule.value 0.001 = 0.1%)
perShare  → fee = shares * rule.value
flat      → fee = rule.value                (default: rule.value returned as-is)
```

Then floor + round:
```
if (rule.minFee && fee < rule.minFee) fee = rule.minFee
fee = Math.round(fee * 100) / 100          (2 decimals)
```
No rule / zero value returns `0`.

Built-in "בלינק Plus" profile: `perShare` $0.01/share both sides, $1.50 min, 25% capital gains tax.

---

## 2. Transaction costs — `computeTransactionCosts(profile, txType, total, shares, price, avgCost)`

**File:** `server/controllers/feeProfileController.js:92`

Fee side picked by type:
```
feeRule  = txType === 'buy' ? profile.buyFee : profile.sellFee
feeAmount = calcFee(feeRule, total, shares)
```

**Capital gains tax — sell only, profit only:**
```
taxAmount = 0
if (txType === 'sell' && profile.capitalGainsTax > 0 && avgCost != null) {
  gain = (price - avgCost) * shares
  if (gain > 0)
    taxAmount = Math.round(gain * capitalGainsTax / 100 * 100) / 100
}
```
Loss on sale = zero tax. `avgCost` pulled live from the current Position doc at sell time (`portfolioController.js:321`).

---

## 3. Sell transaction stored values

**File:** `server/controllers/portfolioController.js:306-344` (create), `:468-478` (edit)

```
total              = shares * price                            (gross proceeds)
feeAmount          = calcFee(sellFee, total, shares)           (profile currency)
feeAmountForTotals = convertFeeToTransactionCurrency(feeAmount, profileCcy, txCcy)
taxAmount          = capital gains tax (section 2, tx currency assumed)
netProceeds        = total - feeAmountForTotals - taxAmount
totalWithFees      = total - feeAmountForTotals                (fees only, no tax)
```
Buy side for contrast: `totalWithFees = total + feeAmountForTotals`, `netProceeds = undefined`.

---

## 4. Position rebuild after sell — `recomputePosition()`

**File:** `server/controllers/portfolioController.js:16`

Full replay of all transactions in date order (avg-cost, NOT FIFO/LIFO). Sell branch:
```
if (totalShares > 0) totalCost -= (totalCost / totalShares) * t.shares
totalShares -= t.shares
```
Removes cost basis proportional to the **current** weighted-average cost. Avg cost per remaining share is unchanged by a sell; only total shares and total cost shrink.

Final:
```
totalShares = Math.max(0, totalShares)
avgCost     = totalCost / totalShares
```
Position **deleted** when `totalShares <= 0`. Runs after every sell create / edit / delete.

---

## 5. Realized gain per sell — `getRealizedGains()`

**File:** `server/controllers/portfolioController.js:532`

Per-ticker running state `{shares, cost}` replayed chronologically; each sell emits:
```
avgCost   = state.cost / state.shares
costBasis = avgCost * sharesSold
proceeds  = tx.total          (fallback: shares * price)
grossGain = proceeds - costBasis
netGain   = grossGain - feePaid - taxPaid
```
State update: `state.cost -= costBasis`, `state.shares -= sharesSold`.

Cash dividend logs its own event: `grossGain = netGain = tx.total`.
Grouped by year → `totalGross`, `totalNet`, `totalDividends`.

---

## 6. Fee currency conversion — `convertFeeToTransactionCurrency(amount, feeCcy, txCcy)`

**File:** `server/controllers/portfolioController.js:70`

```
same currency          → amount
ILS fee, USD tx        → amount * ilsToUsd
USD fee, ILS tx        → amount / ilsToUsd
```
`ilsToUsd` from `stockService.getIlsToUsd()` (Yahoo `ILS=X` inverted, 1h cache, 0.27 fallback).

---

## 7. Worked example

Sell 10 shares @ $100, avgCost $60, Blink Plus (perShare $0.01 min $1.50, 25% tax), USD:

```
total       = 10 * 100 = 1000
feeAmount   = 10 * 0.01 = 0.10 → below min → 1.50
gain        = (100 - 60) * 10 = 400  (> 0)
taxAmount   = 400 * 25 / 100 = 100.00
netProceeds = 1000 - 1.50 - 100 = 898.50
totalWithFees = 1000 - 1.50 = 998.50
```

---

## Key files

| File | Role |
|---|---|
| `server/controllers/feeProfileController.js` | `calcFee`, `computeTransactionCosts`, built-in profile |
| `server/controllers/portfolioController.js` | sell store values, `recomputePosition`, realized gains, fee FX |
| `server/models/FeeProfile.js` | `buyFee`/`sellFee` rule shape, `capitalGainsTax` |
| `server/services/stockService.js` | `getIlsToUsd` FX rate |
