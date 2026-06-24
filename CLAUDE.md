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
- **Groups / tags**: positions and watchlist items both have a `groups: string[]`. `GET /portfolio/groups` returns the union of both. Used for grouping on all 3 main pages.
- **Quote freshness**: Yahoo Finance quotes are cached in-memory (server) with a 5-min TTL. A 90-second client-side TTL controls batch re-fetch on the watchlist. The `X-Cache` header on `/stocks/history` indicates server cache state.
- **No-trade-today badge**: shown when the market is closed and the quote's `regularMarketTime` is not from today.
- **Signal breakdown**: momentum score shown as chip breakdown. Always visible on position page, shown in tooltip on watchlist.

## Directory layout
```
Portfolio/
├── client/src/
│   ├── views/          # Route pages (Dashboard, Watchlist, Holdings, PositionDetail, ...)
│   ├── components/
│   │   ├── ui/         # WatchRow, GroupModeBar, AddTransactionModal, FeeProfilesModal, ...
│   │   └── charts/     # D3 wrappers (StockChart, AllocationChart, MarketsCard, ...)
│   ├── stores/         # Pinia: auth, portfolio, watchlist, alerts, history, feeProfiles, groups, momentum
│   ├── composables/    # useApi, useFormat, useGrouping, useChartRange, useMarketHours,
│   │                   # useMarketSuffix, useMomentumScore, useImport, usePush, usePwa, useAlertNotifier
│   ├── router/index.js
│   ├── sw.js           # Workbox service worker
│   └── style.css
└── server/
    ├── index.js
    ├── controllers/    # portfolioController, stockController, watchlistController,
    │                   # alertController, authController, feeProfileController
    ├── routes/         # portfolio, stocks, watchlist, alerts, auth, feeProfiles
    ├── models/         # User, Position, Transaction, Watchlist, Alert, FeeProfile, PushSubscription
    └── services/       # stockService (Yahoo + cache), historyService, cronService, pushService
```

## Env vars
Server needs: `PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CORS_ORIGINS`, `CLIENT_URL`  
Client needs: `VITE_API_URL`

## Docs
- `docs/ARCHITECTURE.md` — full architecture reference
- `docs/API.md` — all REST endpoints
- `docs/momentum-signal.md` — momentum score algorithm
- `docs/buy-simulator-math.md` — fee/tax calculation math
