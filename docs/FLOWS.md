# StockFolio — Feature Flows

---

## 1. Authentication

### Register
1. User fills name / email / password in `RegisterView`
2. `authStore.register()` → `POST /auth/register`
3. Server hashes password (bcrypt), creates User doc, issues JWT
4. Token + user object saved to `localStorage` + Pinia `authStore`
5. Router guard detects `isAuthenticated` → redirects to Dashboard

### Login
1. `LoginView` → `authStore.login()` → `POST /auth/login`
2. Server compares hashed password, returns JWT
3. Same client-side storage as register
4. 401 anywhere in the app clears storage and pushes `/login`

---

## 2. Portfolio & Positions

### Buying a Stock
1. User opens **Add Transaction** modal (buy mode)
2. Ticker search calls `GET /stocks/search?q=` → user selects result
3. Price pre-filled from `GET /stocks/quote/:ticker` (live)
4. Optional: select a Fee Profile → preview fee/tax costs
5. Submit → `POST /portfolio/transaction` (`type: "buy"`)
6. Server:
   - Computes fee + tax via fee profile if provided
   - Upserts `Position` (creates or adds to existing shares/avgCost with weighted average)
   - Saves `Transaction` doc
7. `portfolioStore.fetchPortfolio()` refreshes — new card appears in Holdings

### Selling a Stock (Full or Partial)
1. From `HoldingsView` → "Sell" button on a `PositionCard`
2. Modal opens in sell mode, pre-filled with position ticker
3. User enters shares to sell (validated ≤ current shares)
4. Submit → `POST /portfolio/transaction` (`type: "sell"`)
5. Server:
   - Reduces position shares; if shares reach 0, deletes the `Position` doc
   - Records capital gains tax if fee profile set
6. Store refresh removes or updates card

### Editing / Deleting a Transaction
- `TransactionsView` lists all transactions
- Edit → `PUT /portfolio/transaction/:id` → position recalculated from scratch
- Delete → `DELETE /portfolio/transaction/:id` → same recalculation

### Custom Groups (Tags)
1. User opens Group Edit modal on any position
2. Types or selects existing tags
3. `PUT /portfolio/position/:id/groups` saves the `groups[]` array
4. `groupsStore.fetchGroups()` updates distinct tag list
5. Holdings / Watchlist / Dashboard can toggle `group-by` mode via `useGrouping` composable

---

## 3. Watchlist

### Adding a Stock
- **Manual**: User opens Add Watchlist modal, searches ticker, confirms
  → `POST /watchlist`
- **Auto-sync**: When a buy transaction is added, `syncHoldings` is called
  → `POST /watchlist/sync-holdings` — any held position not already watched is added

### Viewing Watchlist
1. `WatchlistView` mounts → `watchlistStore.fetchWatchlist(range)`
2. Server returns each item with live quote + sparkline history
3. `WatchRow` renders price, change, sparkline, alert indicator, notification bell

### Removing
- Swipe / delete icon → `DELETE /watchlist/:id`

### Bulk Import (Holdings or Watchlist)
1. From `HoldingsView` or `WatchlistView`, user opens **Import** → `ImportModal` (`mode="holdings"` or `mode="watchlist"`)
2. User uploads `.xlsx`/`.xls`/`.csv`/`.docx` (or downloads a pre-filled template first via `downloadTemplate()`)
3. `useImport.parseFile()` reads the file (SheetJS for spreadsheets, mammoth→first `<table>` for `.docx`) into header/row data
4. `autoMap()` guesses ticker/company/shares/price/date/groups columns from header aliases; user can override the mapping per column
5. `mapRows()` normalizes and validates each row (holdings require ticker + shares > 0 + price > 0; watchlist requires only ticker); invalid rows are flagged with an inline error and excluded from the submit count
6. On confirm, the modal submits valid rows one-by-one as ordinary calls — `POST /portfolio/transaction` (type `buy`) for holdings, `POST /watchlist` for watchlist — tracking per-row success/failure
7. `@imported` emits to the parent view, which refreshes the store; a summary toast reports rows imported vs. failed

---

## 4. Price Alerts

### Creating an Alert
1. `AlertsView` or `StockDetailView` → open Alert Modal
2. Choose ticker, condition (`above` / `below`), target price, optional note
3. `alertsStore.createAlert()` → `POST /alerts`
4. Alert appears in list with `active: true`

### Alert Triggering (Server-side)
1. `cronService` runs every 5 minutes (Mon–Fri, market hours)
2. For each `active` alert, fetches live quote via `stockService.getQuote()`
3. If condition met:
   - Sets `alert.active = false`, `alert.triggeredAt = now`, `alert.triggeredPrice`
   - Calls `pushService.sendPush(userId, payload)` → Web Push to all user subscriptions
4. Dead subscriptions (HTTP 404/410) are automatically pruned

### Client-side Alert Notification
- `useAlertNotifier` composable polls `GET /alerts` every 60 seconds
- Compares `triggeredAt` timestamps against a localStorage watermark
- Shows PrimeVue toast for any newly triggered alerts
- Watermark updated so toasts don't repeat

### Web Push Subscription Flow
1. User visits Profile → toggles "Enable Notifications"
2. `usePush.enablePush()`:
   - Checks `Notification.permission`, requests if not granted
   - Fetches VAPID public key from `GET /alerts/vapid-key`
   - Calls `serviceWorker.pushManager.subscribe()`
   - `POST /alerts/subscribe` saves `PushSubscription` doc
3. On disable: `POST /alerts/unsubscribe` → doc deleted

---

## 5. Portfolio History

### Data Generation (Server)
1. `GET /portfolio/history?range=1mo` → `historyService.getPortfolioHistory()`
2. Loads all user transactions sorted by date
3. For each calendar day in range:
   - Determines holdings at that point (shares × avgCost)
   - Fetches historical close price for each ticker
   - Converts ILS→USD where needed (cached FX rate)
   - Outputs `{ date, value, costBasis }`

### Chart Rendering (Client)
1. `DashboardView` mounts `PortfolioHistoryChart`
2. `historyStore.fetchHistory()` caches result by range with 5-minute TTL
3. D3 renders value line + cost basis line
4. Range selector tabs (1mo / 3mo / 6mo / 1y / all) re-fetch as needed

---

## 6. Stock Detail

1. User taps ticker → `StockDetailView` (route `/stock/:ticker`)
2. Parallel fetches:
   - Live quote: `GET /stocks/quote/:ticker`
   - Price history: `GET /stocks/history/:ticker?range=`
   - User's alerts for this ticker: `alertsStore.forTicker(ticker)`
3. `StockChart` renders candlestick or line chart with range tabs
4. Alert badges show active/triggered state
5. "Add Alert" button pre-fills ticker in Alert Modal
6. User can drag any plotted point to select it; dragging a second point shows both as a comparison (value + % change between the two), emitted via `selection-change` and rendered as a draggable pill overlay

---

## 6a. Extended Hours & Top Movers

### Extended-Hours Display
1. Server quotes (`stockService`) pass through Yahoo's `preMarketPrice`/`preMarketChange`/`preMarketChangePercent` and `postMarketPrice`/`postMarketChange`/`postMarketChangePercent` unchanged
2. `portfolioController` and `watchlistController` attach these fields to each position/watchlist item alongside the regular session `change`/`changePercent`
3. Client components (`WatchRow`, `PositionCard`, `StockDetailView`) use `useMarketHours.getMarketHoursState()` to determine whether the relevant market is in a pre-market or after-hours session
4. When the market is closed and an extended-hours change is available, the UI shows that figure instead of (or alongside) the stale regular-session change — with a fallback to the regular percent if no extended-hours value exists

### Market Hours Card
1. `DashboardView` renders `MarketHoursCard`, listing US/Israel/Europe/Asia/Crypto sessions via `MARKET_HOURS_LIST`
2. Each market's status (`Open`/`Closed`/`Pre-Market Trading`/`After-Hours Trading`) and countdown to the next state change is computed client-side, timezone-aware, no server call needed

### Top Movers / Gainers & Losers
1. Dashboard renders `WatchlistMoversCard` / `TopMoversChart` and `WatchlistGainersLosersCard`, ranking held + watched tickers by `changePercent` (falling back to extended-hours percent when the market is closed)
2. Cards re-rank reactively as `portfolioStore`/`watchlistStore` data refreshes

---

## 7. Fee Profiles

### Setup
1. Profile → Fee Profiles → create profile with country, buy/sell fee %, flat fee, capital gains tax %
2. First profile becomes default; can switch default via PUT
3. Profiles available in transaction modal dropdown

### Fee Calculation (Server)
On each buy/sell transaction with a `feeProfileId`:
- `buyFee.percent` applied to total, plus `buyFee.flat` → `feeAmount`
- On sell: `sellFee` calculated the same; capital gains = `(salePrice − avgCost) × shares × capitalGainsTax%`
- Transaction stored with `feeAmount`, `taxAmount`, `totalWithFees`, `netProceeds`

---

## 8. Multi-Currency Support

- Ticker suffix determines currency:
  - `.TA` → ILS (Israeli Shekel)
  - `.L` → GBP, `.DE` → EUR, `.PA` → EUR, `.TO` → CAD, `.AX` → AUD, `.T` → JPY, `.HK` → HKD
  - No suffix → USD
- `useFormat.tickerCurrency()` returns symbol client-side
- Server converts ILS to USD using a cached FX rate (1-hour cache) for portfolio history

---

## 9. PWA & Service Worker

- Workbox `injectManifest` mode precaches built assets
- Runtime caching: API calls cached network-first (5-min stale)
- Push events handled in SW: constructs notification with title, body, and click URL
- Click on notification navigates to `/alerts` within the app

---

## 10. Grouping & Filtering

- `useGrouping(items, mode)` composable used in Holdings, Watchlist, Dashboard
- Modes:
  - `none` — flat list, original order
  - `market` — grouped by exchange suffix (US, IL, UK…)
  - `group` — grouped by custom tags; untagged items appear under "Other"
- Group headers rendered per view; items within each group maintain their sort

---

## Data Refresh Strategy

| Data | Refresh Trigger |
|------|----------------|
| Portfolio quotes | Mount + manual pull-to-refresh |
| Watchlist quotes | Mount + range tab change |
| Stock history | Range tab change (5-min client cache) |
| Portfolio history | Mount + range tab change |
| Alerts | Mount + `useAlertNotifier` poll (60s) |
| Server quote cache | 5 minutes TTL (node-cache) |
| FX rate cache | 1 hour TTL |
| Cron alert check | Every 5 minutes (Mon–Fri market hours) |
