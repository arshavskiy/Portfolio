---
name: yahoo-finance2
description: Use when touching Yahoo Finance data access in this repo — stockService quote/chart/history calls, blocked or null prices in production, EU consent redirects, crumb/cookie errors, day-change math from chart meta, or picking a range string. Covers the datacenter-IP failure modes this codebase hit and the fallbacks built for them.
---

# yahoo-finance2 in StockFolio

Unofficial Yahoo Finance client. Not a supported API — no guarantee of
availability, freshness, or response shape. Everything here is server-side
only (`server/services/stockService.js`); Yahoo's CORS and cookie behavior
make browser calls impossible.

Pinned at `^3.15.2` (v3 class API). Upstream is on v4 — check the installed
version before trusting v4 docs.

```js
const YahooFinance = require('yahoo-finance2').default
const yahooFinance = new YahooFinance(options)
```

Do not use v1/v2 singleton patterns (`setGlobalConfig()`).

## The two failure modes that actually bite in production

Both are IP-reputation problems. They do not reproduce locally, because a
residential IP is trusted and a datacenter IP (Render/Railway/Fly) is not.
**"Works on my machine" proves nothing here.**

### 1. EU consent redirect

Symptom: `Unexpected redirect to https://finance.yahoo.com/quote/AAPL?guccounter=1`

`guccounter` is Yahoo's consent-gate counter. A bot-looking User-Agent gets
served the GDPR interstitial instead of JSON. The library default UA
(`yahoo-finance2/<version>`) triggers it.

Fix already applied — a browser UA at client init:

```js
const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
  fetchOptions: {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  },
})
```

The same fix applies to the sibling `stockfolio-insights` repo, which calls
Yahoo endpoints with raw `fetch` rather than this library.

### 2. quote() blocked while chart() still works

Symptom: `price: null` in API responses while `history` is fully populated —
sparklines render with no price above them.

`quote()` hits the v7 endpoint, which needs a crumb + cookie handshake and is
denied from datacenter IPs. `chart()` hits v8, which is keyless and keeps
working. A browser UA does **not** fix this one.

Fix: `getQuoteViaChart()` in `stockService.js` reconstructs quote fields from
`chart().meta` — including `regularMarketDayHigh/Low`, `regularMarketVolume`,
and `fiftyTwoWeekHigh/Low` when Yahoo includes them — wired in via
`quoteWithChartFallback()` and used by `getMarkets`, `getTrending`, and
`getQuote`'s failure path (tried before serving a stale snapshot).

`chart().meta` doesn't always carry day-high/low/volume even when present in
`quote()`. When `getQuote()`'s chart fallback still leaves those null, it
tries `resolveQuote()` in `quoteResolver.js` — a third-source chain (Finnhub
→ Yahoo chart-meta again → Stooq CSV) that only fills the still-missing
fields, it doesn't replace the chart-fallback price/change. Finnhub skips
futures/`.TA`/crypto (`/[=.]|-USD$/`); Stooq skips crypto, futures, and `.TA`
(unreliable coverage there). Needs `FINNHUB_API_KEY` set — no-ops (returns
`null`) without it, which is fine, the chain just falls through to Stooq.

## chart meta traps

**`meta.chartPreviousClose` is not yesterday's close.** It is the close
*before the requested window*. Deriving day change from it reports the change
across the whole window — SMCI showed `+25.09%` when the real day was
`-0.96%`.

Take the last daily close preceding the most recent session instead, and fall
back to `chartPreviousClose` only for single-session windows:

```js
const rows = (result?.quotes || []).filter((r) => r?.close != null && r.date)
const lastDay = rows.length ? new Date(rows[rows.length - 1].date).toDateString() : null
const priorRow = [...rows].reverse().find((r) => new Date(r.date).toDateString() !== lastDay)
const prevClose = priorRow?.close ?? m.chartPreviousClose ?? m.previousClose ?? null
```

The chart-meta fallback is a degraded mode, not an equal substitute. Known
gaps versus real `quote()`: crypto day change is materially off (BTC-USD
`-0.37%` vs `-2.86%`) because 24/7 trading means a daily bar is not Yahoo's
rolling previous close; index changes drift slightly. Extended-hours fields
(`preMarket*` / `postMarket*`) are absent from meta entirely — the
Finnhub/Stooq resolver doesn't cover these either, only day-high/low/volume.
`marketCap`, `trailingPE`, and dividend fields also stay null under any
fallback path — none of the three sources carry them.

## Range strings

`getHistory(ticker, range)` branches on exact strings. Valid: `1d`, `5d`,
`1mo`, `3mo`, `6mo`, `1y`, `5y`, `max`.

**`1wk` is not a valid range.** It exists only as a `HISTORY_CACHE_TTLS` key
and has no fetch branch, so it silently falls through to
`rangeMap[range] || 90` — a 90-day window labeled as a week. Use `5d` for
weekly questions. This bug reached the AI tool schema, where "past week"
questions were answered with one-month numbers.

When adding a range to `VALID_RANGES` in `aiInsightsService.js`, verify a
matching branch exists in `stockService.fetchHistoryFresh()` first.

## Module selection

- `search(query)` — when a symbol is uncertain.
- `quote(symbolOrSymbols)` — current quote fields. Blocked on datacenter IPs;
  always have a fallback.
- `chart(symbol, {period1, period2, interval})` — history plus a `meta` block
  carrying quote-ish fields. The resilient choice.
- `quoteSummary(symbol, {modules})` — profiles, calendar events, key stats.
  Request only needed modules.
- `trendingSymbols(region)` — used by `getTrending`, with a hardcoded fallback
  list when it fails.

`historical()` is deprecated by Yahoo and throws on split-adjusted tickers
with null rows (e.g. NVDA). This repo uses `chart()` everywhere instead — do
not reintroduce it.

## Repo-specific conventions

- **TASE scaling**: `.TA` tickers come back in agorot. Divide by `taFactor()`
  (100). Any new price path must apply it — including fallbacks.
- **Never let a Yahoo failure surface as a raw error to the client.** The
  layered degradation is: live quote → chart-meta fallback (+ Finnhub/Stooq
  gap-fill for day-high/low/volume) → in-memory cache → persisted
  `QuoteSnapshot` → throw.
- `withRetry()` only retries 429 and network errors; everything else throws
  immediately.
- Errors are logged server-side with the real cause. In AI paths, upstream
  failures are remapped to `502` — never let a `401` through, since
  `useApi.js` treats any `401` from `/api/*` as session-expired and logs the
  user out.

## Verifying a Yahoo fix

Tests mock the library, so they prove wiring, not Yahoo behavior. For anything
touching response shape or price math, also hit the real API in a scratch
script and compare the fallback against `quote()` on a real ticker:

```bash
node -e "/* chart-derived values vs quote() for the same symbol */"
```

Assume any check run locally cannot reproduce a datacenter-IP block.
