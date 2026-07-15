# StockFolio API Reference

Base URL: `http://localhost:3000/api`  
All protected endpoints require: `Authorization: Bearer <token>`

---

## Authentication

### POST /auth/register
Create a new account.

**Body**
```json
{ "name": "string", "email": "string", "password": "string" }
```
**Response `201`**
```json
{ "token": "jwt", "user": { "_id", "name", "email" } }
```

### POST /auth/login
Authenticate and receive a JWT.

**Body**
```json
{ "email": "string", "password": "string" }
```
**Response `200`**
```json
{ "token": "jwt", "user": { "_id", "name", "email" } }
```

### POST /auth/magic-link
Exchange a magic-link token for a JWT. Tokens are reusable until `expiresAt` (7 days from creation), generated via `npm run magic-link -- "Name" email@example.com` in `server/`. Not user self-serve — no HTTP endpoint creates tokens, only the CLI script.

**Body**
```json
{ "token": "string" }
```
**Response `200`**
```json
{ "token": "jwt", "user": { "_id", "name", "email" } }
```
**Response `401`** — invalid or expired token

### GET /auth/me `🔒`
Return the currently authenticated user.

**Response `200`**
```json
{ "_id", "name", "email" }
```

---

## Portfolio

### GET /portfolio `🔒`
Return all open positions enriched with live quotes.

**Response `200`**
```json
[
  {
    "_id", "ticker", "companyName", "shares", "avgCost", "groups": ["string"],
    "currentPrice", "change", "changePercent",
    "marketValue", "costBasis", "gainLoss", "gainLossPercent",
    "currency"
  }
]
```

### POST /portfolio/transaction `🔒`
Record a buy, sell, or dividend. A sell fully or partially reduces shares; reaching 0 deletes the position.

**Body**
```json
{
  "ticker": "AAPL",
  "type": "buy" | "sell" | "dividend",
  "shares": 10,
  "price": 150.00,
  "date": "2024-01-15",
  "notes": "optional",
  "feeProfileId": "objectId (optional)"
}
```
`feeProfileId` handling:
- Omitted field: server applies the user's default fee profile when one exists.
- `"feeProfileId": null`: explicit no-fee transaction.
- ObjectId value: server applies that specific profile.
- Built-in value such as `"builtin:blink-plus"`: server applies the read-only built-in preset.

Fee amounts are stored in the fee profile currency. Server totals that belong to the transaction, such as `totalWithFees` and `netProceeds`, convert mixed-currency fees into the ticker transaction currency first.

**Response `201`** — created transaction document with fee/tax fields.

### GET /portfolio/transactions `🔒`
Paginated list of all transactions for the user.

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `ticker` | string | Filter by ticker (case-insensitive) |
| `type` | `buy` \| `sell` \| `dividend` | Filter by transaction type |
| `limit` | number | Results per page (default `50`) |
| `page` | number | Page number (default `1`) |

**Response `200`**
```json
{
  "transactions": [
    {
      "_id", "ticker", "type", "shares", "price", "total", "date", "notes",
      "feeAmount", "taxAmount", "totalWithFees", "netProceeds",
      "feeProfile": { "name", "buyFee", "sellFee", "capitalGainsTax", "currency" }
    }
  ],
  "total": 42,
  "page": 1,
  "pages": 2
}
```

### PUT /portfolio/transaction/:id `🔒`
Update an existing transaction (same body fields as POST).

**Response `200`** `{ "transaction": { ...updatedFields } }`

### DELETE /portfolio/transaction/:id `🔒`
Delete a transaction and recompute the position's avg-cost and shares.

**Response `200`** `{ "message": "Transaction deleted" }`

### DELETE /portfolio/position/:id `🔒`
Delete an entire position and all its transactions.

**Response `200`** `{ "message": "Position removed" }`

### GET /portfolio/history `🔒`
Portfolio value over time (daily, replayed from transactions).

**Query params**

| Param | Values | Default |
|-------|--------|---------|
| `range` | `1mo` `3mo` `6mo` `1y` `all` | `1mo` |

**Response `200`**
```json
[
  { "date": "2024-01-15", "value": 12345.67, "costBasis": 10000.00 }
]
```

### GET /portfolio/return-metrics `🔒`
Money-weighted (XIRR) and time-weighted (TWR) return, combined across currencies in USD. XIRR treats buys/DRIP as outflows, sells and cash dividends as inflows, and current portfolio value as a final inflow at today's date. TWR chain-links the daily value series from `GET /portfolio/history`.

**Query params**

| Param | Values | Default |
|-------|--------|---------|
| `range` | `1mo` `3mo` `6mo` `1y` `all` | `all` |

**Response `200`**
```json
{ "irr": 12.4, "twr": 9.8 }
```
`irr`/`twr` are percentages, or `null` if there aren't enough transactions to compute them.

### GET /portfolio/risk `🔒`
Sector allocation and portfolio-weighted beta, with values needed to run a client-side stress-test projection. Positions without a fetched beta fall back to `1.0` (market-average).

**Response `200`**
```json
{
  "sectors": [
    { "sector": "Technology", "valueUsd": 5000, "percent": 62.5 }
  ],
  "weightedBeta": 1.12,
  "totalValueUsd": 8000
}
```

### GET /portfolio/groups `🔒`
Return all distinct group tags across the user's positions **and** watchlist items, sorted alphabetically.

**Response `200`** `string[]`

### PUT /portfolio/position/:id/groups `🔒`
Set the groups array on a position.

**Body**
```json
{ "groups": ["Tech", "Growth"] }
```

### GET /portfolio/realized-gains `🔒`
Realized capital gains by year, computed using the avg-cost method. Includes dividends per year.

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `year` | number | Filter to a single year |

**Response `200`**
```json
{
  "years": [
    {
      "year": 2024,
      "sells": [
        {
          "_id", "ticker", "date", "shares", "price",
          "proceeds", "costBasis", "avgCostAtSale",
          "feePaid", "taxPaid", "grossGain", "netGain", "notes"
        }
      ],
      "dividends": [
        { "_id", "ticker", "date", "isDividend": true, "grossGain", "netGain", "notes" }
      ],
      "totalGross": 1234.56,
      "totalNet": 1100.00,
      "totalDividends": 200.00
    }
  ],
  "availableYears": [2024, 2023]
}
```

### GET /portfolio/dividends/summary `🔒`
Dividend totals per ticker plus a grand total.

**Response `200`**
```json
{
  "summary": [
    {
      "ticker": "AAPL",
      "total": 123.45,
      "count": 4,
      "drip": false,
      "transactions": [...],
      "shares": 10,
      "avgCost": 150.00
    }
  ],
  "grandTotal": 500.00
}
```

### GET /portfolio/dividends/calendar `🔒`
Upcoming ex-dividend / payment dates for held tickers (Yahoo `calendarEvents` +
`summaryDetail`, 12h server cache). Events from the last 3 days onward, sorted
by date. `estimatedPayout` = last per-share dividend × shares held.

**Response `200`**
```json
{
  "events": [
    {
      "ticker": "AAPL",
      "companyName": "Apple Inc.",
      "exDividendDate": "2026-08-10T00:00:00.000Z",
      "dividendDate": "2026-08-14T00:00:00.000Z",
      "dividendRate": 1.04,
      "dividendYield": 0.0045,
      "lastDividendValue": 0.26,
      "shares": 10,
      "estimatedPayout": 2.60
    }
  ]
}
```

### GET /portfolio/position/notes/:ticker `🔒`
Journal notes (investment thesis) for a held position. Returns `{ticker, notes}`;
`notes` is `""` when no position or no notes.

### PUT /portfolio/position/notes/:ticker `🔒`
Save journal notes. Body `{ "notes": "..." }` (max 5000 chars). `404` if the
position doesn't exist.

### GET /portfolio/rebalance-targets `🔒`
Saved target allocation + drift-alert config. Returns
`{targets: [{ticker, percent}], threshold, enabled, lastNotifiedAt}` or the
defaults `{targets: [], threshold: 5, enabled: false}` when nothing saved.

### PUT /portfolio/rebalance-targets `🔒`
Upsert targets. Body `{targets: [{ticker, percent}], threshold, enabled}`.
Percents must sum to 100 (±0.5) or the request fails `400`. A daily cron
(16:30 ET, Mon–Fri) compares live allocation and pushes when any position
drifts past `threshold` (max one push per day, tracked via `lastNotifiedAt`).

---

## Stocks

All `/stocks` routes require authentication (`🔒`).

### GET /stocks/search?q= `🔒`
Search for tickers (equities only).

**Query**: `q=apple`  
**Response `200`**
```json
[{ "ticker": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ" }]
```

### GET /stocks/quote/:ticker `🔒`
Live quote for a single ticker.

**Response `200`**
```json
{
  "ticker": "AAPL", "price": 189.50, "change": 1.20, "changePercent": 0.64,
  "open", "high", "low", "previousClose", "volume", "marketCap",
  "earningsTimestamp": "2026-07-30T20:00:00.000Z",
  "currency": "USD"
}
```

`earningsTimestamp` (next earnings date, may be null) also flows through the enriched watchlist rows. The client shows an amber earnings-week badge beside the ticker when the timestamp is today through 7 days out.

### GET /stocks/history/:ticker `🔒`
OHLCV price history.

**Query params**

| Param | Values | Default |
|-------|--------|---------|
| `range` | `1d` `5d` `1mo` `3mo` `6mo` `1y` | `1mo` |
| `points` | number ≥ 2 | — (returns all bars) |

`1d` range returns intraday 5-minute bars. `points` down-samples the result to at most that many data points.

**Response headers**: `X-Cache: HIT | MISS`, `Cache-Control: private, max-age=<ttl>`

**Response `200`**
```json
[{ "date": "2024-01-15", "open", "high", "low", "close", "volume" }]
```

### GET /stocks/markets `🔒`
Major market indices with price + sparkline history.

**Query params**

| Param | Values | Default |
|-------|--------|---------|
| `group` | `US` `Israel` `Europe` `Crypto` | `US` |

**Response `200`**
```json
{
  "group": "US",
  "groups": ["US", "Israel", "Europe", "Crypto"],
  "indices": [
    {
      "symbol": "^GSPC", "name": "S&P 500",
      "price", "change", "changePercent",
      "history": [{ "date", "close" }]
    }
  ]
}
```

### GET /stocks/trending `🔒`
Trending / most-active tickers for a region.

**Query params**

| Param | Values | Default |
|-------|--------|---------|
| `group` | `US` `Israel` `Israel Tech` `Crypto` | `US` |

**Response `200`**
```json
{
  "group": "US",
  "groups": ["US", "Israel", "Israel Tech", "Crypto"],
  "items": [
    { "ticker", "name", "price", "change", "changePercent", "currency" }
  ]
}
```

### GET /stocks/fx/ils-to-usd `🔒`
Current ILS → USD exchange rate (cached).

**Response `200`**
```json
{ "ilsToUsd": 0.271 }
```

### GET /stocks/news `🔒`
Return normalized financial news articles.

The endpoint uses Marketaux first, then Finnhub, then Yahoo Finance search fallback. `topic=for-you` derives Marketaux symbols from the authenticated user's watchlist. If the watchlist is empty, it resolves to `markets`.

With `lang=ru` and `GNEWS_API_KEY` set, GNews (native Russian articles via per-topic `ruQuery` strings) is tried first; the English chain remains the fallback. The client news store sends `lang=ru` automatically when the app locale is Russian. Cache keys are lang-scoped.

**Query params**

| Param | Values | Default |
|-------|--------|---------|
| `topic` | `for-you` `markets` `tech` `financials` `crypto` `energy` `israel` `positive` | `markets` |
| `limit` | `1` to `24` | `4` |
| `page` | positive integer | `1` |
| `lang` | `en` `ru` | `en` |

**Response `200`**
```json
{
  "topic": "for-you",
  "resolvedTopic": "for-you",
  "provider": "marketaux",
  "page": 1,
  "hasMore": true,
  "topics": [
    { "value": "for-you", "label": "For You" },
    { "value": "markets", "label": "Markets" }
  ],
  "articles": [
    {
      "title": "Article title",
      "url": "https://example.com/article",
      "image": "https://example.com/image.jpg",
      "source": "publisher.com",
      "summary": "Short article summary",
      "symbols": ["AAPL"],
      "publishedAt": "2026-06-05T08:00:00.000Z"
    }
  ]
}
```

`hasMore` is `true` for Marketaux pages while articles are returned. Finnhub and Yahoo fallback feeds are first-page only.

### GET /stocks/news/article/:id `🔒`
Return a single normalized article from the server's short-lived news cache.

The `id` comes from `/stocks/news` article results. If the server cache has expired or the article was never loaded on this server instance, the endpoint returns `404`.

**Response `200`**
```json
{
  "article": {
    "id": "sha1-url",
    "title": "Article title",
    "url": "https://example.com/article",
    "image": "https://example.com/image.jpg",
    "source": "publisher.com",
    "summary": "Short article summary",
    "symbols": ["AAPL"],
    "publishedAt": "2026-06-05T08:00:00.000Z",
    "provider": "marketaux"
  }
}
```

### POST /stocks/ai-ask `🔒`
Ask a natural-language question about the user's portfolio; answered by an OpenAI chat completion (`gpt-4o-mini`) given a small static context (current holdings, watchlist items, recent news — owned vs. watched clearly separated) plus tool-calling access to the user's own data. The model calls tools on demand rather than everything being pre-loaded into the prompt:

| Tool | Purpose |
|------|---------|
| `get_price_return` | % price change for one or more tickers over `1mo`/`3mo`/`6mo`/`1y`/`5y`/`max`, from daily closes — powers "best/worst performer over X" questions |
| `get_transactions` | Raw buy/sell/dividend history, optionally filtered by ticker |
| `get_realized_gains` | Avg-cost realized gains/losses from sells, grouped by year |
| `get_dividend_summary` | Total dividends received per ticker, all-time |

Up to 4 tool-call rounds run before the final answer is returned. Requires `OPENAI_API_KEY`; without it the endpoint returns `503`. Rate-limited to 20 requests/user/day (in-memory counter, resets on server restart).

**Body**
```json
{ "question": "Why is my portfolio down today?" }
```
Question is capped at 500 characters.

**Response `200`**
```json
{ "answer": "...", "usage": { "promptTokens": 512, "completionTokens": 87 } }
```
**Response `400`** — empty question
**Response `429`** — daily limit reached
**Response `503`** — AI Q&A not configured (no API key)
**Response `502`** — upstream OpenAI request failed

---

## Watchlist

### GET /watchlist `🔒`
All watched stocks with live quotes, sparkline history, and quote metadata used by watchlist badges/grouping.

**Query**: `range=1mo` (sparkline range, same values as stock history)

**Response `200`**
```json
[
  {
    "_id", "ticker", "companyName", "sector", "industry", "addedAt", "groups": ["string"],
    "price", "change", "changePercent", "currency",
    "dividendRate", "dividendYield", "earningsTimestamp",
    "history": [{ "date", "close" }]
  }
]
```

`dividendYield > 0` or `dividendRate > 0` means the client treats the row as dividend-supported: it shows a compact dividend marker on the watchlist row and places the row under `Dividend payers` in dividend grouping mode. Rows without positive dividend fields go under `No dividend data`. `earningsTimestamp` drives the amber earnings countdown badge.

### GET /watchlist/skeleton `🔒`
Watchlist items straight from the DB — no quotes, no history. Fast first paint; the client renders these rows immediately while `GET /watchlist` loads.

**Response `200`**
```json
[
  {
    "_id", "ticker", "companyName", "sector", "industry", "addedAt",
    "history": [], "groups": ["string"]
  }
]
```

### GET /watchlist/item/:ticker `🔒`
Check whether a specific ticker is in the watchlist and return its metadata.

**Response `200`**
```json
{
  "item": {
    "_id", "ticker", "companyName", "sector", "industry", "addedAt", "groups": ["string"]
  }
}
```
`item` is `null` if the ticker is not in the watchlist.

### POST /watchlist `🔒`
Add a stock to the watchlist. Fetches sector/industry profile automatically.

**Body**
```json
{ "ticker": "AAPL", "companyName": "Apple Inc." }
```

**Response `201`** — full watchlist document.

**Response `409`** if already in watchlist.

### POST /watchlist/sync-holdings `🔒`
Auto-add all current positions to the watchlist (idempotent).

**Response `200`** `{ "synced": 5 }`

### PUT /watchlist/:id/groups `🔒`
Set the groups array on a watchlist item.

**Body**
```json
{ "groups": ["Tech", "Growth"] }
```

**Response `200`** `{ "_id", "ticker", "groups" }`

### DELETE /watchlist/:id `🔒`
Remove a stock from the watchlist.

**Response `200`** `{ "message": "Removed from watchlist" }`

---

## Alerts

### GET /alerts/vapid-key
Return the VAPID public key for Web Push subscription setup. No auth required.

**Response `200`** `{ "publicKey": "base64url" }`

### POST /alerts/subscribe `🔒`
Register a push subscription for the current user.

**Body** — standard PushSubscription object from browser:
```json
{ "endpoint": "url", "keys": { "p256dh": "base64", "auth": "base64" } }
```

### POST /alerts/unsubscribe `🔒`
Remove the push subscription matching the endpoint.

**Body** `{ "endpoint": "url" }`

### GET /alerts `🔒`
Return all alerts for the current user.

**Response `200`**
```json
[
  {
    "_id", "ticker", "condition": "above" | "below",
    "target": 200.00, "note": "optional",
    "active": true, "triggeredAt": null, "triggeredPrice": null
  }
]
```

### POST /alerts `🔒`
Create a new price alert.

**Body**
```json
{
  "ticker": "AAPL",
  "condition": "above" | "below",
  "target": 200.00,
  "note": "optional"
}
```

### PUT /alerts/:id `🔒`
Update an alert (any body fields).

### DELETE /alerts/:id `🔒`
Delete an alert.

---

## Fee Profiles

### GET /fee-profiles `🔒`
All saved fee profiles for the current user. Read-only built-in presets are injected client-side and can also be selected in transaction requests by stable IDs such as `builtin:blink-plus`.

**Response `200`**
```json
[
  {
    "_id", "name", "country", "currency",
    "buyFee": { "type": "percent", "value": 0.001, "minFee": 0 },
    "sellFee": { "type": "percent", "value": 0.001, "minFee": 0 },
    "capitalGainsTax": 25,
    "isDefault": true
  }
]
```

Fee rule types:

| Type | Calculation |
|------|-------------|
| `percent` | `trade total * value` |
| `flat` | fixed `value` |
| `perShare` | `shares * value` |

`minFee` is applied after the raw fee is calculated.

Built-in preset currently available:

| ID | Name | Fee | Tax | Monthly usage |
|----|------|-----|-----|---------------|
| `builtin:blink-plus` | `בלינק Plus` | `$0.01/share`, `$1.50` minimum | `25%` | `10 tx/mo or 1,000 shares/mo` |

### POST /fee-profiles `🔒`
Create a fee profile. First profile becomes default automatically.

### PUT /fee-profiles/:id `🔒`
Update a fee profile.

### DELETE /fee-profiles/:id `🔒`
Delete a fee profile.

---

## Error Responses

All errors follow:
```json
{ "error": "human-readable message" }
```

| Status | Meaning |
|--------|---------|
| `400` | Validation error / bad request |
| `401` | Missing or invalid JWT |
| `403` | Forbidden (resource belongs to another user) |
| `404` | Resource not found |
| `409` | Conflict (e.g. ticker already in watchlist) |
| `500` | Internal server error |
