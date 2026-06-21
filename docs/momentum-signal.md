# Momentum Signal System

## Overview

Each watchlist row displays a directional signal badge (▲▲ / ▲ / → / ▼ / ▼▼) computed from data already loaded for the watchlist — no extra API calls for most stocks. Only the top movers trigger a lazy 1-month history fetch for wave pattern confirmation.

---

## Score System

### Step 1 — Momentum Score (always runs, range: -7 to +7)

Four signals derived from data already present on the watchlist item. Signals 1 and 2 are weighted by move magnitude; signals 3 and 4 are binary.

#### Signal 1 — Pre/post-market extended hours (weighted, max ±3)

| Move | Vote |
|---|---|
| > +5% | +3 |
| +2% to +5% | +2 |
| +0.5% to +2% | +1 |
| ±0.5% | 0 |
| -0.5% to -2% | -1 |
| -2% to -5% | -2 |
| < -5% | -3 |

Source: `postMarketChangePercent` / `preMarketChangePercent` (last-seen fallbacks included). In `WatchRow` uses time-of-day to pick pre vs post; sort function uses whichever is available.

#### Signal 2 — Today's session (weighted, max ±2)

| Move | Vote |
|---|---|
| > +3% | +2 |
| 0% to +3% | +1 |
| 0% | 0 |
| -3% to 0% | -1 |
| < -3% | -2 |

Source: `changePercent`

#### Signal 3 — Week trend (±1)

Compares `history[0].close` vs `history[last].close`. Last > first → +1, last < first → -1.

#### Signal 4 — Price vs week SMA (±1)

Calculates the simple moving average of all `history[].close` values. Price above SMA → +1, below → -1.

**Momentum score = sum of all votes → integer from -7 to +7**

### Step 2 — Wave Vote (lazy, only when |momentum| ≥ 3)

When the momentum score reaches ±3 or ±4, the row fetches 1-month daily history (30 points, cached 1 hour) and runs a swing pivot analysis.

**Pivot detection:** a point is a swing high if it is higher than both its neighbours; a swing low if lower than both.

| Wave pattern | Vote |
|---|---|
| Higher highs + higher lows | +1 (uptrend structure) |
| Lower highs + lower lows | -1 (downtrend structure) |
| Mixed / insufficient pivots | 0 (no confirmation) |

Requires at least 6 close values and 2 swing highs + 2 swing lows to vote.

### Step 3 — Combined Score (range: -8 to +8)

```
combinedScore = momentumScore + waveVote
```

---

## Badge Thresholds

| Badge | Condition | Meaning |
|---|---|---|
| ▲▲▲ | `combinedScore >= 6` | Very strong bullish — big extended move + strong day + trend + wave |
| ▲▲ | `combinedScore >= 4` | Strong bullish |
| ▲ | `combinedScore >= 2` | Bullish lean |
| → | `-1 to +1` | No clear signal |
| ▼ | `combinedScore <= -2` | Bearish lean |
| ▼▼ | `combinedScore <= -4` | Strong bearish |
| ▼▼▼ | `combinedScore <= -6` | Very strong bearish |

The badge tooltip shows the raw combined score on hover.

---

## Sort Tab (▲ button in GroupModeBar)

Sorts the watchlist flat (no group headers) by `momentumScoreOf(item)` descending — highest score first.

- Tap once → bullish first (▲▲ at top, ▼▼ at bottom)
- Tap again → bearish first (▼▼ at top, ▲▲ at bottom), button turns red and flips to ▼
- Ties at the same score are broken alphabetically by ticker

The sort uses `momentumScoreOf()` from `useGrouping.js` (the 4-signal score, not the combined score) because wave data is fetched asynchronously per-row and isn't available at sort time. Stocks with score 4 are always the ▲▲ candidates and naturally sort first.

---

## API Cost

| Condition | API calls |
|---|---|
| `|momentumScore| < 4` (most stocks) | 0 extra calls |
| `|momentumScore| >= 4` (top movers) | 1 call per ticker for 1mo history, cached 1 hour |

The wave fetch is triggered by a `watch` on `momentumScore` in `WatchRow.vue`. Once fetched, results are held in the history store cache and reused if the user navigates away and back.

---

## Key Files

| File | Role |
|---|---|
| `client/src/components/ui/WatchRow.vue` | Per-row score computation, wave fetch, badge rendering |
| `client/src/composables/useGrouping.js` | `momentumScoreOf()` export, `momentum` sort mode |
| `client/src/components/ui/GroupModeBar.vue` | ▲ sort tab, green/red styling, flip-on-tap behaviour |
| `client/src/stores/history.js` | 1mo history cache used by wave detection |
