# Buy & Sell Simulator — Math Review

## Summary (position stats)

| Calculation | Formula | Status |
|---|---|---|
| Running weighted average | `totalCost / shares` after each lot | ✅ Correct |
| Gross P&L | `currentValue - totalCost` | ✅ Correct |
| Gross P&L % | `(currentPrice - avgCost) / avgCost × 100` | ✅ Correct |
| Estimated sell tax | `unrealizedGain × taxRate / 100` (only when gain > 0) | ✅ Correct |
| Net P&L | `grossPnl - totalFees - totalTax - estimatedTax` | ✅ Correct |
| Net P&L % | `netPnl / (totalCost + totalFees) × 100` | ✅ Correct — basis includes buy fees paid |

## Sell Simulator

| Calculation | Formula | Status |
|---|---|---|
| Gross proceeds | `sellPrice × shares` | ✅ Correct |
| Sell fee | `calcFee(profile.sellFee, grossProceeds)` | ✅ Correct |
| Capital gains tax | `(grossProceeds - totalCost) × taxRate / 100` (only when gain > 0) | ✅ Correct |
| Net proceeds | `grossProceeds - sellFee - tax` | ✅ Correct |
| Net profit | `netProceeds - totalCost - totalBuyFees` | ✅ Correct — sunk buy fees deducted |
| Net profit % | `netProfit / (totalCost + totalBuyFees) × 100` | ✅ Correct |

## Buy Simulator

### Core (`calcBuySimulation`)

| Calculation | Formula | Status |
|---|---|---|
| Shares cost | `price × shares` | ✅ Correct |
| Buy fee | `calcFee(profile.buyFee, cost)` | ✅ Correct |
| Total outlay | `cost + buyFeeInTickerCurrency` | ✅ Correct |
| New avg cost | `(existingCost + totalOutlay) / (existingShares + shares)` | ✅ Correct — includes fee in avg |
| Break-even price | `(combinedCost + estimatedSellFee) / combinedShares` | ✅ Correct — accounts for future sell fee |

### Amount mode

`wholeShares = Math.floor(budget / price)` → buys as many whole shares as the budget allows.

**Bug fixed:** Leftover cash was `budget - cost` (shares cost only). Corrected to `budget - totalCost` (shares cost + buy fee), so leftover accurately reflects unspent cash after the full outlay.

### Target average mode

Solves for the number of shares needed to reach a desired average cost:

```
shares = (existingShares × targetAvg - existingCost) / (price - targetAvg)
```

Derived from:
```
(existingCost + shares × price) / (existingShares + shares) = targetAvg
→ shares × (price - targetAvg) = existingShares × targetAvg - existingCost
→ shares = (existingShares × targetAvg - existingCost) / (price - targetAvg)
```

Requires `price < targetAvg` (averaging down). Both numerator and denominator are negative → positive share count. ✅ Correct. Result is rounded up with `Math.ceil` so the average is at or below target. ✅ Correct.
