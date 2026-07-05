# StockFolio — Architecture Overview

---

## Stack

| Layer | Technology |
|-------|-----------|
| Client | Vue 3, Pinia, Vue Router, PrimeVue, D3.js, Tailwind CSS, Vite |
| Server | Node.js, Express.js |
| Database | MongoDB Atlas (Mongoose ODM) |
| External Data | Yahoo Finance (via `yahoo-finance2`) |
| Auth | JWT (jsonwebtoken) + bcrypt, Google Sign-In (google-auth-library) |
| Push | Web Push API + VAPID (web-push library) |
| Background Jobs | node-cron |
| PWA | Workbox (injectManifest) |

---

## Directory Structure

```
Portfolio/
├── client/                  # Vite + Vue 3 PWA
│   ├── src/
│   │   ├── main.js           # App bootstrap (Vue, Pinia, PrimeVue)
│   │   ├── App.vue
│   │   ├── sw.js             # Service worker (Workbox)
│   │   ├── router/index.js   # Vue Router with auth guards
│   │   ├── stores/           # Pinia state modules
│   │   │   ├── auth.js
│   │   │   ├── portfolio.js
│   │   │   ├── watchlist.js
│   │   │   ├── alerts.js
│   │   │   ├── history.js
│   │   │   ├── feeProfiles.js
│   │   │   └── groups.js
│   │   ├── composables/      # Reusable logic
│   │   │   ├── useApi.js
│   │   │   ├── useFormat.js
│   │   │   ├── useGrouping.js
│   │   │   ├── useChartRange.js
│   │   │   ├── useMarketSuffix.js
│   │   │   ├── useMarketHours.js
│   │   │   ├── useImport.js
│   │   │   ├── useTour.js
│   │   │   ├── usePush.js
│   │   │   ├── usePwa.js
│   │   │   └── useAlertNotifier.js
│   │   ├── views/            # Route-level pages
│   │   ├── components/
│   │   │   ├── ui/           # Interactive UI components
│   │   │   └── charts/       # D3 chart wrappers
│   │   └── layouts/
│   │       └── MobileLayout.vue
│   └── vite.config.js
│
└── server/                  # Express REST API
    ├── index.js              # Entry: Express setup, routes, cron init
    ├── middleware/auth.js    # JWT verify middleware
    ├── routes/               # Route definitions (thin)
    ├── controllers/          # Business logic
    ├── models/               # Mongoose schemas
    └── services/
        ├── stockService.js   # Yahoo Finance + in-memory cache
        ├── historyService.js # Portfolio value replay
        ├── cronService.js    # Scheduled jobs
        └── pushService.js    # Web Push dispatch
```

---

## Data Models

```
User
 ├── name, email, password (hashed)
 └── ──< Position (user ref)
          ├── ticker, companyName, shares, avgCost
          ├── groups: string[]
          └── ──< Transaction (user + ticker)
                   ├── type: buy|sell
                   ├── shares, price, date, notes
                   └── feeAmount, taxAmount, totalWithFees, netProceeds

 ├── ──< Watchlist (user ref)
 │        └── ticker, companyName, addedAt
 │
 ├── ──< Alert (user ref)
 │        ├── ticker, condition: above|below, target
 │        └── active, triggeredAt, triggeredPrice
 │
 ├── ──< FeeProfile (user ref)
 │        ├── name, country, currency
 │        ├── buyFee: { type: percent|flat|perShare, value, minFee }
 │        ├── sellFee: { type: percent|flat|perShare, value, minFee }
 │        ├── capitalGainsTax
 │        └── isDefault
 │
 └── ──< PushSubscription (user ref)
          └── endpoint, keys: { p256dh, auth }
```

---

## Client Architecture

### Pages
- **Dashboard** (`/`) — markets overview, watchlist movers, top momentum, allocation breakdown, portfolio value over time, and portfolio totals (`PortfolioStatsCard`: USD / ILS / combined, with a one-tap ₪↔$ currency toggle persisted to `holdings-combined-currency`)
- **Watchlist** (`/watchlist`) — the hub for both watched and held stocks. Held rows carry a neon-blue accent; a briefcase toggle filters to holdings-only (persisted via `watchlist-held-only`). The header exposes Add-transaction, Import (watchlist **or** holdings), Rebalance, Export CSV, and Add-to-watchlist. The former standalone Holdings page was removed; `/holdings` redirects here.
- **PositionDetail** (`/position/:ticker`), **Transactions**, **Alerts**, **News**, **Rebalance**, **Profile** — supporting pages
- **Guided Tour** — `driver.js` walkthrough mounted from `AppLayout`, replayable from Account or by URL parameter; not a route
- **What's New** — `WhatsNewModal` mounts once in `AppLayout` and pops on load after a release (see below); not a route

### State Management (Pinia Stores)
Each store follows the same pattern:
- State: reactive refs (`ref([])`, `ref(false)`)
- Actions: async functions that call `useApi` composable
- No getters beyond simple computed values

```
authStore      → JWT + user identity
portfolioStore → positions with live quotes
watchlistStore → watched stocks
alertsStore    → price alerts
historyStore   → price/portfolio history cache (by ticker+range)
feeProfilesStore → trading fee templates
groupsStore    → distinct group tags
```

### Composables
- **`useApi`** — all HTTP calls go through here; injects Bearer token automatically, clears auth on 401, and logs only 5xx/429 API failures to the console so expected 4xx validation responses stay user-facing without noisy error logs
- **`useFormat`** — number/currency formatting; detects ILS vs USD from ticker suffix
- **`useGrouping`** — pure function, groups any `items[]` by market or custom tag
- **`useChartRange`** — shared range-tab state (`1d`/`5d`/`1mo`/`6mo`/`1y`) used by `RangeBar`
- **`useMarketSuffix`** — persists selected market suffix to localStorage
- **`useMarketHours`** — pure functions computing open/closed state, countdowns, and pre/post-market session windows per exchange (US, Israel, Europe, Asia, Crypto), timezone-aware via `Intl.DateTimeFormat`
- **`useImport`** — parses uploaded `.xlsx`/`.xls`/`.csv`/`.docx` files (SheetJS, mammoth for docx) into rows, auto-maps columns to ticker/shares/price/date/groups by header aliases, validates rows, and generates a downloadable template
- **`usePush`** — Web Push subscription lifecycle, reactive state
- **`usePwa`** — install-prompt/update lifecycle for the PWA
- **`useAlertNotifier`** — background polling for triggered alerts → toast
- **`useTour`** — guided walkthrough orchestration using `driver.js`: gates first-run display with `stockfolio-tour-seen`, filters steps to anchors present on the current viewport, moves from Dashboard Top Movers into Position details, and supports manual replay via Account or `?tour`
- **`useWhatsNew`** — changelog modal gate: compares the newest `data/changelog.js` version against the `changelog-seen-version` localStorage key, shows `WhatsNewModal` with unseen entries on load, and marks the version seen on dismiss (see [What's New](#whats-new-changelog))

### Routing & Guards
- All authenticated routes nested under `MobileLayout`
- `router.beforeEach` checks `authStore.isAuthenticated`; redirects unauthenticated users to `/login`
- Guest routes (`/login`, `/register`) redirect authenticated users to `/`

---

## Server Architecture

### Request Lifecycle
```
Client HTTP request
  → Express router
  → auth middleware (JWT verify, populate req.user)
  → controller function
      → Mongoose queries (models)
      → stockService (Yahoo Finance, cached)
  → JSON response
```

### Caching Layers
| Cache | Location | TTL | What |
|-------|----------|-----|------|
| Quote cache | `stockService` in-memory (node-cache) | 5 min | Yahoo Finance quotes per ticker |
| FX rate | `stockService` in-memory | 1 hr | ILS→USD exchange rate |
| History cache | `historyStore` (client, reactive Map) | 5 min | Stock price history per ticker+range |

**Watchlist first paint**: `GET /watchlist/skeleton` returns items straight from Mongo (no quotes/history, one query) so the list renders instantly on load; the `watchlistStore` swaps in the full enriched `GET /watchlist` response when it arrives. Skeleton rows show `—` for price/percent and a neutral signal until enrichment lands.

### Extended-Hours Quotes
`stockService` quotes carry Yahoo's pre/post-market fields through unchanged: `preMarketPrice`, `preMarketChange`, `preMarketChangePercent`, `postMarketPrice`, `postMarketChange`, `postMarketChangePercent`. `portfolioController` and `watchlistController` attach these alongside the regular `change`/`changePercent` per position/watchlist item. The client falls back to the extended-hours percent when the market is closed and a pre/post value is present (see `useMarketHours.js` for session-state detection used to decide which figure to show).

### Yahoo Resilience
`stockService` wraps Yahoo calls with retry/backoff for HTTP 429 and transient network errors. Last-good quote snapshots are persisted in MongoDB so cold starts or Yahoo throttling can serve stale quote data instead of failing the whole portfolio/watchlist request.

### Fee Profile Presets
`feeProfileController` owns read-only built-in profiles with stable IDs such as `builtin:blink-plus`. `portfolioController` resolves those IDs before fee calculation, but does not store them in `Transaction.feeProfile` because they are not user-owned MongoDB documents. The calculated `feeAmount`, `taxAmount`, `totalWithFees`, and `netProceeds` are still stored on the transaction.

### Background Jobs (cronService)
Two cron schedules registered at startup:

| Schedule | Task |
|----------|------|
| `*/5 * * * 1-5` (Mon–Fri) | Refresh portfolio quotes cache (market hours filter applied in code) |
| `*/5 * * * 1-5` | Check all active alerts → trigger + push notify |

---

## Web Push Flow

```
Client                       Server                    Browser/OS
  │                             │                           │
  ├─ GET /alerts/vapid-key ────►│                           │
  │◄── { publicKey } ──────────┤                           │
  │                             │                           │
  ├─ navigator.serviceWorker   │                           │
  │  .pushManager.subscribe()  │                           │
  │                             │                           │
  ├─ POST /alerts/subscribe ──►│                           │
  │  { endpoint, keys }        │                           │
  │◄── 200 OK ─────────────────┤                           │
  │                             │                           │
  │              [cron: alert triggered]                    │
  │                             │                           │
  │                       web-push.sendNotification()       │
  │                             │──────────────────────────►│
  │                             │     Push Message          │
  │◄────────────────────────────┼──── SW push event ───────┤
  │  showNotification()         │                           │
```

---

## Multi-Currency

- Ticker suffix → currency map in `useMarketSuffix` and `useFormat`
- Server: detects `.TA` tickers, fetches ILS quote, converts to USD for portfolio aggregation
- Client: `tickerCurrency()` returns symbol for display; values stored in native currency per position

---

## PWA

Configured via `vite-plugin-pwa` in `vite.config.js` (`strategies: injectManifest`, `registerType: autoUpdate`). The custom service worker lives at `client/src/sw.js`.

### Manifest & Installability
- **Manifest**: name `StockFolio`, `display: fullscreen` with `display_override: [fullscreen, standalone, minimal-ui]`, portrait orientation, black theme/background, `start_url: /`, and 192/512 icons plus a maskable 512 variant.
- **Install prompt**: `composables/usePwa.js` (`usePwaInstall`) captures `beforeinstallprompt` at module load (so the event isn't missed before a component mounts) and exposes `promptInstall()`; listens for `appinstalled`.
- **Install banner**: `components/ui/InstallBanner.vue` shows a slide-up prompt only when installable, not already installed, authenticated, and not previously dismissed (`install-banner-dismissed` in localStorage).
- **iOS**: no `beforeinstallprompt` support — `usePwa` exposes `isIos` so the UI can show a manual "Share → Add to Home Screen" hint instead.

### Service Worker (`src/sw.js`)
- **Precaching**: all built assets via Workbox `precacheAndRoute(self.__WB_MANIFEST)` (`globPatterns: **/*.{js,css,html,ico,png,svg}`).
- **Runtime caching**: `/api/*` requests use `NetworkFirst` (cache `api-cache`, max 50 entries, 300s TTL) so recent data still renders when offline/flaky.
- **Update flow**: `skipWaiting()` on install + `clients.claim()` on activate, combined with `autoUpdate`, so new versions take over immediately.
- **Dev**: `devOptions.enabled: false` — the SW is disabled in dev to avoid serving stale JS bundles and breaking HMR; production builds keep the full SW (push + offline).

### Web Push
- **Push handler**: `push` event renders a notification with title/body, app icon + badge, a vibrate pattern, and a `tag` keyed by ticker (alerts for the same stock collapse).
- **Notification click**: focuses an existing app window and navigates it to `notification.data.url` (fallback `/`), or opens a new window.
- **Subscription lifecycle**: `composables/usePush.js` checks capability + secure context, requests `Notification` permission, fetches the VAPID key from `GET /alerts/vapid-key`, subscribes via `pushManager`, and posts to `/alerts/subscribe` (and `/alerts/unsubscribe` on disable). Drives the price-alert feature.
- **Constraints**: HTTPS-only (a LAN IP over plain http silently fails; localhost is exempt). On iOS, Push is only available once the app is installed to the Home Screen.

### Fullscreen
- `composables/usePwa.js` (`useFullscreen`) wraps the Fullscreen API with `webkit` fallbacks — `enter`/`exit`/`toggle` plus reactive `isFullscreen` synced to `fullscreenchange`.

---

## What's New (Changelog)

A "what's new" modal shows the release notes on the first load after each deploy.

- **Source of truth**: `client/src/data/changelog.js` exports `changelog` (an array of `{ version, date, title, changes[] }`, newest first) and `currentVersion` (the top entry's `version`). Adding a new entry is what triggers the modal on the next load — no build/git wiring.
- **Gate** (`composables/useWhatsNew.js`): stores the last acknowledged version in the `changelog-seen-version` localStorage key. On mount (`AppLayout.onMounted → checkForUpdates()`):
  - First-ever load (`seen === null`) → silently seed the current version, no modal (don't greet brand-new users with a changelog)
  - `seen !== currentVersion` → open `WhatsNewModal` with every entry newer than `seen`
  - `dismiss()` writes `currentVersion` to the seen key
- **Force / preview**: append `?changelog` to any URL to force-open the full changelog regardless of seen state; `dismiss()` strips the param via `history.replaceState` so it doesn't re-fire.
- **PWA caveat**: since the SW is `registerType: 'autoUpdate'`, a tab left open across a deploy only picks up the new changelog after the SW reloads it. Fresh loads and PWA relaunches show it immediately.

## Guided Tour

The guided tour introduces the primary portfolio workflow after login.

- **Source of truth**: `client/src/composables/useTour.js` defines the tour steps and navigation handoffs. `client/src/assets/tour.css` contains the `driver.js` theme overrides and highlighted-element styling.
- **Flow**: starts on Dashboard, highlights navigation and portfolio context, focuses the first available Top Movers item, opens that ticker into the Position page, explains overview/chart controls and the two-click chart range measurement, then continues through Watchlist actions including Import.
- **Gate**: the first completed or closed tour writes `stockfolio-tour-seen` to localStorage so the walkthrough does not auto-open repeatedly.
- **Replay**: Account exposes a Start Tour action that clears the seen flag and launches the tour again.
- **URL parameter**: append `?tour` to any authenticated app URL to force the tour to run, for example `/watchlist?tour` or `/?tour`. The parameter bypasses the seen flag and is removed with `history.replaceState` after launch so refreshes do not keep retriggering it.
- **What's New interaction**: `AppLayout` waits for `WhatsNewModal` to close before auto-starting the tour. A forced `?tour` launch still runs after that modal is dismissed.

## Analytics & Client Errors

- `composables/useAnalytics.js` installs Google Analytics page-view tracking only in production, only when `VITE_GA_MEASUREMENT_ID` is set, and not when browser Do Not Track is enabled. Router navigation sends explicit `page_view` events. `trackEvent(name, params)` sends custom events (ticker selects, nav clicks, watchlist/alert/dividend/fee-profile/transaction modal submits, watchlist search) under the same gating.
- `composables/useClientErrors.js` centralizes client error logging: Vue errors, window errors, unhandled promise rejections, and suppressed PrimeVue error toasts are logged with `[StockFolio]` context.
- Error toasts are suppressed globally; validation feedback should use warn/info/success toasts, while unexpected errors should go to the browser console.

---

## Environment Variables

### Server (`server/.env`)
```
PORT=3000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...
JWT_EXPIRES_IN=7d
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:...
CORS_ORIGINS=http://localhost:5173
CLIENT_URL=http://localhost:5173
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
```

### Client (`client/.env`)
```
VITE_API_URL=http://localhost:3000/api
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
```
