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
Record a buy or sell. A sell fully or partially reduces shares; reaching 0 deletes the position.

**Body**
```json
{
  "ticker": "AAPL",
  "type": "buy" | "sell",
  "shares": 10,
  "price": 150.00,
  "date": "2024-01-15",
  "notes": "optional",
  "feeProfileId": "objectId (optional)"
}
```
**Response `201`** — created transaction document with fee/tax fields.

### PUT /portfolio/transaction/:id `🔒`
Update an existing transaction (same body fields as POST).

### DELETE /portfolio/transaction/:id `🔒`
Delete a transaction and recompute the position's avg-cost and shares.

### DELETE /portfolio/position/:id `🔒`
Delete an entire position and all its transactions.

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

### GET /portfolio/groups `🔒`
Return all distinct group tags across the user's positions.

**Response `200`** `string[]`

### PUT /portfolio/position/:id/groups `🔒`
Set the groups array on a position.

**Body**
```json
{ "groups": ["Tech", "Growth"] }
```

---

## Stocks

### GET /stocks/search?q=
Search for tickers (equities only).

**Query**: `q=apple`  
**Response `200`**
```json
[{ "ticker": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ" }]
```

### GET /stocks/quote/:ticker
Live quote for a single ticker.

**Response `200`**
```json
{
  "ticker": "AAPL", "price": 189.50, "change": 1.20, "changePercent": 0.64,
  "open", "high", "low", "previousClose", "volume", "marketCap",
  "currency": "USD"
}
```

### GET /stocks/history/:ticker
OHLCV price history.

**Query params**

| Param | Values | Default |
|-------|--------|---------|
| `range` | `1d` `5d` `1mo` `3mo` `6mo` `1y` | `1mo` |

**Response `200`**
```json
[{ "date": "2024-01-15", "open", "high", "low", "close", "volume" }]
```
`1d` range returns intraday 5-minute bars.

### GET /stocks/news `🔒`
Return normalized financial news articles.

The endpoint uses Marketaux first, then Finnhub, then Yahoo Finance search fallback. `topic=for-you` derives Marketaux symbols from the authenticated user's watchlist. If the watchlist is empty, it resolves to `markets`.

**Query params**

| Param | Values | Default |
|-------|--------|---------|
| `topic` | `for-you` `markets` `tech` `financials` `crypto` `energy` `israel` `positive` | `markets` |
| `limit` | `1` to `24` | `4` |
| `page` | positive integer | `1` |

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

---

## Watchlist

### GET /watchlist `🔒`
All watched stocks with live quotes and sparkline history.

**Query**: `range=1mo` (sparkline range, same values as stock history)

**Response `200`**
```json
[
  {
    "_id", "ticker", "companyName", "addedAt",
    "price", "change", "changePercent", "currency",
    "history": [{ "date", "close" }]
  }
]
```

### POST /watchlist `🔒`
Add a stock to the watchlist.

**Body**
```json
{ "ticker": "AAPL", "companyName": "Apple Inc." }
```

### POST /watchlist/sync-holdings `🔒`
Auto-add all current positions to the watchlist (idempotent).

### DELETE /watchlist/:id `🔒`
Remove a stock from the watchlist.

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
All fee profiles for the current user.

**Response `200`**
```json
[
  {
    "_id", "name", "country", "currency",
    "buyFee": { "percent": 0.1, "flat": 0 },
    "sellFee": { "percent": 0.1, "flat": 0 },
    "capitalGainsTax": 25,
    "isDefault": true
  }
]
```

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
| `500` | Internal server error |
