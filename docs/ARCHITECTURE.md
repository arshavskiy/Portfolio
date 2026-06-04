# StockFolio — Architecture Overview

---

## Stack

| Layer | Technology |
|-------|-----------|
| Client | Vue 3, Pinia, Vue Router, PrimeVue, D3.js, Vite |
| Server | Node.js, Express.js |
| Database | MongoDB Atlas (Mongoose ODM) |
| External Data | Yahoo Finance (via `yahoo-finance2`) |
| Auth | JWT (jsonwebtoken) + bcrypt |
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
│   │   │   ├── usePush.js
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
 │        ├── buyFee: { percent, flat }
 │        ├── sellFee: { percent, flat }
 │        ├── capitalGainsTax
 │        └── isDefault
 │
 └── ──< PushSubscription (user ref)
          └── endpoint, keys: { p256dh, auth }
```

---

## Client Architecture

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
- **`useApi`** — all HTTP calls go through here; injects Bearer token automatically
- **`useFormat`** — number/currency formatting; detects ILS vs USD from ticker suffix
- **`useGrouping`** — pure function, groups any `items[]` by market or custom tag
- **`useMarketSuffix`** — persists selected market suffix to localStorage
- **`usePush`** — Web Push subscription lifecycle, reactive state
- **`useAlertNotifier`** — background polling for triggered alerts → toast

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

- **Service Worker**: `injectManifest` mode (Workbox) — full control over SW logic
- **Precaching**: all static assets from Vite build manifest
- **Runtime caching**: API responses cached network-first
- **Push handling**: `self.addEventListener('push', ...)` in `sw.js` renders notifications
- **Notification click**: `self.addEventListener('notificationclick', ...)` navigates to `/alerts`

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
```

### Client (`client/.env`)
```
VITE_API_URL=http://localhost:3000/api
```
