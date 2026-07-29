# StockFolio — Claude Project Context

## What this is
A mobile-first PWA for tracking a personal stock portfolio. Multi-user, multi-currency (USD + ILS), with live quotes, price alerts via Web Push, and fee/tax tracking.

## Stack
- **Client**: Vue 3 (Options-free, Composition API), Pinia, Vue Router, PrimeVue, D3.js, Vite, `vite-plugin-pwa` (injectManifest)
- **Server**: Node.js + Express, Mongoose, `yahoo-finance2`, `node-cron`, `web-push`
- **DB**: MongoDB Atlas
- **Language**: JavaScript only — no TypeScript, no `.ts` files

## Dev commands
```
# from repo root:
cd server && npm run dev   # Express on :3000
cd client && npm run dev   # Vite on :5173
```

## Key conventions
- No TypeScript — plain `.js` and `.vue` files only
- No comments unless the WHY is genuinely non-obvious
- No docstrings or multi-line comment blocks
- Mobile-first layout — primary test viewport is a phone screen
- All routes are protected by `router.use(auth)` in route files (except `/auth/*` and `/alerts/vapid-key`)
- Client HTTP calls all go through `composables/useApi.js` (injects Bearer token)
- Currency: ILS tickers end in `.TA`; `useFormat.js` and `tickerCurrency()` handle display; server stores values in native currency per position

## Domain rules
- **Avg-cost method**: position `avgCost` is always the weighted average of all buys. On sell, the avg cost is used to compute gain/loss. `recomputePosition()` in `portfolioController` replays all transactions.
- **Transaction types**: `buy`, `sell`, `dividend` (dividend can be DRIP = reinvested)
- **Fee profiles**: percent + flat fee per side (buy/sell) + capital gains tax rate. Applied at transaction time. Stored in profile currency; converted to transaction currency for `totalWithFees` / `netProceeds`.
- **Groups / tags**: positions and watchlist items both have a `groups: string[]`. `GET /portfolio/groups` returns the union of both. Used for grouping on the Dashboard and Watchlist pages.
- **Watchlist = holdings hub**: the standalone Holdings page was removed. Watchlist is the single place to manage both watched and held stocks — held rows show a neon-blue accent, a briefcase filter shows holdings-only, dividend-paying rows show a green yield badge, and the header carries Add-transaction / Import-holdings / Rebalance actions. `/holdings` redirects to `/watchlist`. Portfolio totals (USD / ILS / combined) live on the Dashboard via `PortfolioStatsCard`.
- **Watchlist first paint**: `GET /watchlist/skeleton` returns items straight from the DB (no quotes/history) so rows render instantly; the full `GET /watchlist` enrichment replaces them when it lands.
- **New-user demo seed**: every new account (register, Google OAuth, or magic-link via `createMagicLink.js`) runs `seedDemoAccount()` in `demoSeedService.js` exactly once, gated by `User.demoSeedVersion` (bumped to `DEMO_SEED_VERSION`, currently `1`) and `demoSeededAt`; a version bump re-triggers seeding for accounts stamped with an older version. Skipped entirely if the user already has any Watchlist/Position/Transaction docs (still stamps the version so it doesn't retry). Default data — see [Default account data](#default-account-data) below.
- **What's New modal**: `data/changelog.js` is the source of truth (newest entry first). `useWhatsNew.js` gates on a `changelog-seen-version` localStorage key and shows `WhatsNewModal` on load when the top version is newer than last seen. Add a new entry per release to trigger it. Force-open for previewing with the `?changelog` query param.
- **Auto-changelog on push**: a `pre-push` hook (`.githooks/pre-push` → `scripts/update-changelog.js`) folds any `Changelog: <text>` trailer from pushed commits into today's changelog entry (creating it if the date rolled over), then aborts the push so you commit `changelog.js` and push again. Enable per clone with `git config core.hooksPath .githooks`. Commits with no trailer are ignored, so internal work stays out of the user-facing changelog.
- **Quote freshness**: Yahoo Finance quotes are cached in-memory (server) with a 5-min TTL. A 90-second client-side TTL controls batch re-fetch on the watchlist. The `X-Cache` header on `/stocks/history` indicates server cache state.
- **No-trade-today badge**: shown when the market is closed and the quote's `regularMarketTime` is not from today.
- **Signal breakdown**: momentum score shown as chip breakdown. Always visible on position page, shown in tooltip on watchlist.
- **i18n**: `i18n/messages.js` holds en + ru trees (must stay key-synced); `useI18n()` returns `t(key, params)`. Locale store persists to localStorage. All user-facing strings go through `t()`.

## Default account data
Every new account gets seeded once via `seedDemoAccount()` (`server/services/demoSeedService.js`) so the guided tour and first-run screens have real data to show. Source of truth: `WATCHLIST_DEMO` / `HOLDING_DEMO` in that file.

**Watchlist** (6 items, all tagged `groups: ['Demo', 'Watchlist']`):

| Ticker | Company | Sector |
|--------|---------|--------|
| AAPL | Apple Inc. | Technology |
| MSFT | Microsoft Corporation | Technology |
| GOOGL | Alphabet Inc. | Communication Services |
| AMZN | Amazon.com, Inc. | Consumer Cyclical |
| NVDA | NVIDIA Corporation | Technology |
| ^GSPC | S&P 500 | Index (also tagged `Index`) |

**Holding** (1 position + matching buy transaction, tagged `groups: ['Demo', 'Holding', 'Dividend']`):
- **O** (Realty Income Corporation) — Real Estate / REIT - Retail
- 10 shares @ $62.00 avg cost ($620 total)
- Buy transaction dated 30 days before account creation (`daysAgo(30)`), no fees
- Position notes: "Demo dividend holding for the guided tour. Delete it when you are ready to add your real portfolio."

**Price alerts**: an `above` alert per watchlist stock, excluding `^GSPC` (AAPL/MSFT/GOOGL/AMZN/NVDA), target set to 5% above the live quote fetched at seed time (`ALERT_ABOVE_PCT` in `demoSeedService.js`) — computed live rather than hardcoded so it's never stale. Also adds a `below` alert for the held `O` position at 150% of live price so the next alert cron pass can trigger it during the guided tour. Best-effort: quote fetch failures skip alert creation without blocking account creation.

This mix exists so the tour can walk through Dashboard (P&L on a real position), Watchlist (mixed watched + held rows), Position detail, Transactions, dividend badges/grouping, holdings, and price-alert flows — all against real API responses instead of mocked UI state. Bump `DEMO_SEED_VERSION` in `demoSeedService.js` and update this table if the default set changes.

## Feature inventory (built — do NOT rebuild)
- **Portfolio history chart**: `GET /portfolio/history?range=` reconstructs daily (or intraday for 1d) portfolio value by replaying transactions × price history — `PortfolioHistoryChart` on Dashboard + desktop views.
- **Realized gains report**: `GET /portfolio/realized-gains` groups sells + dividends by year; Transactions page "Realized Gains" tab has per-year filter and CSV export (`exportGainsCSV`). Plain transactions CSV export also exists (`exportCSV`).
- **Dividend calendar**: `GET /portfolio/dividends/calendar` (Yahoo calendarEvents, 12h cache) → `DividendCalendarCard` on both dashboards; 08:00 ET cron pushes ex-div-tomorrow heads-up.
- **Price targets**: position page renders active alerts as distance-to-target progress bars (`priceTargets` computed in PositionDetailView).
- **Watchlist dividend grouping**: `GET /watchlist` quote enrichment includes `dividendRate` / `dividendYield`; group mode `dividend` splits rows into Dividend payers vs No dividend data and sorts payers by highest yield.
- **Earnings badges**: quotes carry `earningsTimestamp`; WatchRow shows an amber `earnings-badge` countdown beside the ticker when earnings are ≤ 7 days out (`Earnings` today, otherwise `Nd`).
- **Benchmark overlay**: PortfolioCompareChart overlays ^GSPC / ^TA125.TA as dashed toggleable lines (localStorage-persisted).
- **Russian news**: `GET /stocks/news?lang=ru` uses GNews (needs `GNEWS_API_KEY`) with per-topic `ruQuery`; news store auto-sends lang when locale=ru. Falls back to English chain.
- **Position journal**: `Position.notes` + GET/PUT `/portfolio/position/notes/:ticker`; collapsible editor on position page.
- **Drift alerts**: `RebalanceTarget` model (targets + threshold per user); Rebalance page saves them; 16:30 ET cron pushes when live allocation drifts past threshold (once/day max).
- **Buy/Sell simulators**, **rebalance planner**, **import (Excel/CSV/Word)**, **guided tour**, **groups/tags**, **momentum signal** — all live; see views before adding anything similar.
- **Magic-link sign-in**: `POST /auth/magic-link` exchanges a token for a JWT — reusable, 7-day expiry (Mongo TTL index auto-deletes expired `MagicLinkToken` docs). No self-serve endpoint generates tokens; run `cd server && npm run magic-link -- "Name" email@example.com` to create a user (demo-seeded) + printable `/login?magic=<token>` URL. Client auto-consumes `?magic=` on `LoginView` mount via `auth.loginWithMagicLink()`.
- **Insights page**: `client/src/views/InsightsView.vue` (route `/insights`), a full nav-level page — 7th slot in mobile `BottomNav.vue` and desktop `DesktopLayout.vue` sidebar (`pi-chart-pie` icon), with a matching step in the guided tour (`useTour.js`, `data-tour="nav-insights"`). Three top-level tabs sit next to the page `h1` (not a separate tab bar): **Insights** (AI chat only — `AskPortfolioPanel.vue`, full-width, always-expanded, no collapse toggle), **Income** (dividend forecast, top contributors, mixed-currency ILS/USD toggle), and **Health** (largest position, sector spread, IRR/TWR, portfolio beta, sector breakdown, stress-test slider). Only one tab's content renders at a time; switching away from Insights hides the AI chat. Reports/Scenario sections still exist in the component but are unreachable (no tab points to them) — kept for a future re-enable rather than deleted. Income forecasts call `GET /portfolio/dividends/frequency` so real Yahoo dividend event months drive payout placement when available, with quarterly fallback spacing. Mixed-currency income values use the same persisted dashboard currency key (`holdings-combined-currency`).
- **IRR/TWR return metrics**: `GET /portfolio/return-metrics` — `server/services/returnMetrics.js` computes XIRR (Newton's method + bisection fallback) over dated cash flows (buys/DRIP negative, sells/dividends/current value positive) and TWR (daily chain-linked from `historyService.getPortfolioHistory()`). Surfaced on Insights Health tab.
- **Risk exposure / stress test**: `GET /portfolio/risk` — sector allocation % and portfolio-weighted beta (`Position.beta`, fetched via `stockService.getTickerProfile()`'s `defaultKeyStatistics` module, falls back to `1.0` if unavailable). Client computes the stress-test projection (`value * (1 + weightedBeta * shockPct)`) live off a slider — no server round-trip per tick.
- **AI portfolio Q&A**: `POST /stocks/ai-ask` — `server/services/aiInsightsService.js` sends a small static context (current holdings, watchlist-only tickers labeled separately, recent news) plus OpenAI tool-calling access to `gpt-4o-mini`. Four tools let the model pull data on demand instead of it all being pre-baked into the prompt: `get_price_return` (price % change over 1mo/3mo/6mo/1y/5y/max, via `stockService.getHistory()` — this is what answers "best/worst performer over X" questions), `get_transactions`, `get_realized_gains` (avg-cost sells by year), `get_dividend_summary`. Runs up to 4 tool-call rounds (`MAX_TOOL_ROUNDS`) before returning; `usage.promptTokens`/`completionTokens` sum across all rounds. Requires `OPENAI_API_KEY`; returns `503` without it. Rate-limited 20 requests/user/day (in-memory). Upstream OpenAI errors are always remapped to `502` (and logged server-side with the real cause before remapping) — never let a raw 401 through, since `useApi.js` treats any 401 from `/api/*` as session-expired and logs the user out. Client is `AskPortfolioPanel.vue` — a persistent chat (full message history, date/time per message, token counts per reply, history collapsed to the last 6 messages behind a toggle) that lives only on the Insights tab. Known-ticker text in both chat replies and the daily summary is linkified to `/position/:ticker` via the shared `composables/useTickerLinkify.js`.
- **AI daily summary**: `GET /stocks/ai-daily-summary` — canned (non-conversational) single-shot summary of today's holdings/watchlist/market performance, reusing `ai-ask`'s context builders plus `stockService.getMarkets('US')` for index performance. Cached per-user per calendar day *and* language on `User.aiDailySummary` (key `YYYY-MM-DD:lang`); `?force=true` bypasses the cache, `?lang=en|ru` sets response language. Does not consume the `ai-ask` daily question quota. Client is `DailySummaryCard.vue` on both mobile and desktop Dashboards (`DashboardView.vue` / `DesktopDashboardView.vue`, above `MarketsCard`) — refresh button, dismiss (X) button that hides the card until the next calendar day (`daily-summary-dismissed-day` localStorage key), and re-fetches automatically when the app locale changes.
- **Account modal**: Account is a `Dialog` (`AccountModal.vue`, `defineModel('visible')`), not a route — opened from a fixed top-right circular icon on mobile (`AccountShortcut.vue`, hidden ≥1024px) or a sidebar button pinned to the bottom on desktop (`DesktopLayout.vue`). Transaction History and Price Alerts open as their own stacked `Dialog`s from inside it (same pattern as the existing `FeeProfilesModal`), each embedding `TransactionsView`/`AlertsView` via an `embedded` prop that hides their own page header. `/account` route still exists as a deep-link fallback (`AccountView.vue`, kept in sync) but isn't the primary entry point.
- **Watchlist actions**: on mobile, the Watchlist header's action buttons (held-filter, rebalance, import, export, add-transaction, add-to-watchlist) collapse into a single `⋮` trigger via `WatchlistActionsMenu.vue`, teleported (`<Teleport to="#page-actions-slot">`, mount order matters — the slot div must render before `MobileLayout`/`DesktopLayout` in `AppLayout.vue`) to sit next to the Account icon. Desktop keeps them as an inline row. The guided tour's watchlist-actions step opens the mobile dropdown via `onHighlightStarted` and closes it again on "Next".
- **News/typology enrichment (from the `stockfolio-insights` sibling repo)**: that repo is a separate,
  **local-only data-aggregation pipeline** — its workers (news ingest + LLM tagging, earnings/filings/
  ownership/short-interest calendar, live quotes) run manually/locally and write to a MongoDB Atlas DB
  named `stockfolio-insights`, sibling to this app's own DB on the same cluster. That repo's own Express
  API is **not deployed and has no caller** — this backend is the only thing that serves that data, by
  reading the DB directly: `server/models/insightsModels.js` (`mongoose.connection.useDb('stockfolio-insights')`,
  read-only schema mirrors) → `server/services/stockfolioInsightsService.js` (`getEnrichment`,
  `getTypologyMap`, `getRelatedTickers`, all 5-10min in-memory cached) → `server/routes/enrich.js`
  (`GET /enrich/:ticker`, `GET /enrich/typology-map?group=`, `GET /enrich/related/:ticker`). Client:
  `TickerInsightCard.vue` (sentiment/momentum/typology chips/insider net/earnings beat-rate/analyst
  delta/short interest, on `PositionDetailView.vue` + `DesktopPositionPanel.vue`), `TickerRelationGraph.vue`
  (D3 force graph of tickers co-mentioned in the same analyzed news article — weight = shared-article
  count in the trailing N days, same two position views), `TypologyMapView.vue` (treemap grouped by
  style/marketCapClass/volatilityClass/primaryIndustry, route `/typology-map`). All fields degrade to
  null/[] gracefully — that upstream repo has known gaps (no 13F institutional holdings, Stooq-sourced
  daily candles currently blocked) that surface here as empty sections, not errors.

## Directory layout
```
Portfolio/
├── client/src/
│   ├── views/          # Route pages (Dashboard, Watchlist, PositionDetail, ...)
│   ├── data/           # Static app data (changelog.js)
│   ├── components/
│   │   ├── ui/         # WatchRow, PortfolioStatsCard, WhatsNewModal, GroupModeBar, AddTransactionModal, ...
│   │   └── charts/     # D3 wrappers (StockChart, AllocationChart, MarketsCard, ...)
│   ├── stores/         # Pinia: auth, portfolio, watchlist, alerts, history, feeProfiles, groups, momentum
│   ├── composables/    # useApi, useFormat, useGrouping, useChartRange, useMarketHours, useWhatsNew,
│   │                   # useMarketSuffix, useMomentumScore, useImport, usePush, usePwa, useAlertNotifier
│   ├── router/index.js
│   ├── sw.js           # Workbox service worker
│   └── style.css
└── server/
    ├── index.js
    ├── controllers/    # portfolioController, stockController, watchlistController,
    │                   # alertController, authController, feeProfileController
    ├── routes/         # portfolio, stocks, watchlist, alerts, auth, feeProfiles
    ├── models/         # User, Position, Transaction, Watchlist, Alert, FeeProfile, PushSubscription, RebalanceTarget
    └── services/       # stockService (Yahoo + cache), historyService, returnMetrics, aiInsightsService, cronService, pushService
```

## Env vars
Server needs: `PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CORS_ORIGINS`, `CLIENT_URL`, `GOOGLE_CLIENT_ID`; news (optional): `MARKETAUX_API_TOKEN`, `FINNHUB_API_KEY`, `GNEWS_API_KEY` (Russian articles); AI Q&A (optional): `OPENAI_API_KEY`  
Client needs: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`

## Docs
- `docs/ARCHITECTURE.md` — full architecture reference
- `docs/API.md` — all REST endpoints
- `docs/momentum-signal.md` — momentum score algorithm
- `docs/buy-simulator-math.md` — fee/tax calculation math
- `docs/analytics.md` — GA4 events reference
