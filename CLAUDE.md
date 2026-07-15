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
- **New-user demo seed**: brand-new password or Google accounts run `seedDemoAccount()` once. It creates watchlist-only `TSLA`, dividend holding `O` (Realty Income), and a real `O` buy transaction tagged `Demo` so the first guided tour can show Dashboard, Watchlist, Position, Transactions, dividend badges/grouping, and holdings flows using normal APIs. `User.demoSeedVersion` / `demoSeededAt` prevent reruns.
- **What's New modal**: `data/changelog.js` is the source of truth (newest entry first). `useWhatsNew.js` gates on a `changelog-seen-version` localStorage key and shows `WhatsNewModal` on load when the top version is newer than last seen. Add a new entry per release to trigger it. Force-open for previewing with the `?changelog` query param.
- **Auto-changelog on push**: a `pre-push` hook (`.githooks/pre-push` → `scripts/update-changelog.js`) folds any `Changelog: <text>` trailer from pushed commits into today's changelog entry (creating it if the date rolled over), then aborts the push so you commit `changelog.js` and push again. Enable per clone with `git config core.hooksPath .githooks`. Commits with no trailer are ignored, so internal work stays out of the user-facing changelog.
- **Quote freshness**: Yahoo Finance quotes are cached in-memory (server) with a 5-min TTL. A 90-second client-side TTL controls batch re-fetch on the watchlist. The `X-Cache` header on `/stocks/history` indicates server cache state.
- **No-trade-today badge**: shown when the market is closed and the quote's `regularMarketTime` is not from today.
- **Signal breakdown**: momentum score shown as chip breakdown. Always visible on position page, shown in tooltip on watchlist.
- **i18n**: `i18n/messages.js` holds en + ru trees (must stay key-synced); `useI18n()` returns `t(key, params)`. Locale store persists to localStorage. All user-facing strings go through `t()`.

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
- **Demo watchlist seed**: `seedDemoAccount()` in `demoSeedService.js` gives every new user (register/Google/magic-link) a starter watchlist of AAPL, MSFT, GOOGL, AMZN, NVDA, ^GSPC plus one demo holding (`O`). Gated by `User.demoSeedVersion`.
- **Magic-link sign-in**: `POST /auth/magic-link` exchanges a token for a JWT — reusable, 7-day expiry (Mongo TTL index auto-deletes expired `MagicLinkToken` docs). No self-serve endpoint generates tokens; run `cd server && npm run magic-link -- "Name" email@example.com` to create a user (demo-seeded) + printable `/login?magic=<token>` URL. Client auto-consumes `?magic=` on `LoginView` mount via `auth.loginWithMagicLink()`.
- **Insights page**: `client/src/views/InsightsView.vue` (route `/insights`), a full nav-level page — 7th slot in mobile `BottomNav.vue` and desktop `DesktopLayout.vue` sidebar (`pi-chart-pie` icon), with a matching step in the guided tour (`useTour.js`, `data-tour="nav-insights"`). `AskPortfolioPanel.vue` (AI chat) sits above the tabs, always visible. Four tabs — Income (dividend forecast, top contributors), Health (largest position, sector spread, IRR/TWR, portfolio beta, sector breakdown, stress-test slider), Reports (planned Tax Summary / Dividend Report cards), Scenario (what-if buy simulator) — rendered as folder-style tabs: the active tab visually welds into the panel below (matching background, no seam), with a horizontal-scroll pill row on mobile (smaller text, larger icons) and a 4-column grid on desktop.
- **IRR/TWR return metrics**: `GET /portfolio/return-metrics` — `server/services/returnMetrics.js` computes XIRR (Newton's method + bisection fallback) over dated cash flows (buys/DRIP negative, sells/dividends/current value positive) and TWR (daily chain-linked from `historyService.getPortfolioHistory()`). Surfaced on Insights Health tab.
- **Risk exposure / stress test**: `GET /portfolio/risk` — sector allocation % and portfolio-weighted beta (`Position.beta`, fetched via `stockService.getTickerProfile()`'s `defaultKeyStatistics` module, falls back to `1.0` if unavailable). Client computes the stress-test projection (`value * (1 + weightedBeta * shockPct)`) live off a slider — no server round-trip per tick.
- **AI portfolio Q&A**: `POST /stocks/ai-ask` — `server/services/aiInsightsService.js` sends a small static context (current holdings, watchlist-only tickers labeled separately, recent news) plus OpenAI tool-calling access to `gpt-4o-mini`. Four tools let the model pull data on demand instead of it all being pre-baked into the prompt: `get_price_return` (price % change over 1mo/3mo/6mo/1y/5y/max, via `stockService.getHistory()` — this is what answers "best/worst performer over X" questions), `get_transactions`, `get_realized_gains` (avg-cost sells by year), `get_dividend_summary`. Runs up to 4 tool-call rounds (`MAX_TOOL_ROUNDS`) before returning; `usage.promptTokens`/`completionTokens` sum across all rounds. Requires `OPENAI_API_KEY`; returns `503` without it. Rate-limited 20 requests/user/day (in-memory). Upstream OpenAI errors are always remapped to `502` — never let a raw 401 through, since `useApi.js` treats any 401 from `/api/*` as session-expired and logs the user out. Client is `AskPortfolioPanel.vue` — a collapsible persistent chat (full message history with token counts shown per reply) above the tabs on Insights.
- **Account modal**: Account is a `Dialog` (`AccountModal.vue`, `defineModel('visible')`), not a route — opened from a fixed top-right circular icon on mobile (`AccountShortcut.vue`, hidden ≥1024px) or a sidebar button pinned to the bottom on desktop (`DesktopLayout.vue`). Transaction History and Price Alerts open as their own stacked `Dialog`s from inside it (same pattern as the existing `FeeProfilesModal`), each embedding `TransactionsView`/`AlertsView` via an `embedded` prop that hides their own page header. `/account` route still exists as a deep-link fallback (`AccountView.vue`, kept in sync) but isn't the primary entry point.
- **Watchlist actions**: on mobile, the Watchlist header's action buttons (held-filter, rebalance, import, export, add-transaction, add-to-watchlist) collapse into a single `⋮` trigger via `WatchlistActionsMenu.vue`, teleported (`<Teleport to="#page-actions-slot">`, mount order matters — the slot div must render before `MobileLayout`/`DesktopLayout` in `AppLayout.vue`) to sit next to the Account icon. Desktop keeps them as an inline row. The guided tour's watchlist-actions step opens the mobile dropdown via `onHighlightStarted` and closes it again on "Next".

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
