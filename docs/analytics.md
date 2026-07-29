# StockFolio — GA Events

Google Analytics 4 via `gtag.js`, loaded lazily. Source: `client/src/composables/useAnalytics.js`.

## Setup

- `VITE_GA_MEASUREMENT_ID` env var (client). Unset in dev by default — see `.env.example`.
- Loads only when: `import.meta.env.PROD` is true, measurement ID is set, `window` exists, and `navigator.doNotTrack !== '1'`.
- `installAnalytics(router)` called once from `main.js`. Injects the `gtag.js` script tag, initializes `dataLayer`, sends `config` with `send_page_view: false` (page views are sent manually per route, not by the default GA snippet).

## Page views

- `router.afterEach` hook calls `trackPageView(to.fullPath)` on every route change.
- Sends GA4 `page_view` with `page_path`, `page_location`, `page_title`.

## Custom events

All sent via `trackEvent(name, params)`, a thin wrapper over `window.gtag('event', name, params)`. No-ops if analytics disabled.

| Event name | Params | Fired from |
|---|---|---|
| `nav_click` | `nav_item` (route key or `'account'`) | `BottomNav.vue`, `DesktopLayout.vue`, `AccountShortcut.vue` |
| `select_ticker` | `ticker`, `source` (search context, when applicable) | `useNavigateToPosition.js`, `WatchlistView.vue`, `DesktopDashboardView.vue`, ticker-search select in `AddTransactionModal.vue` |
| `search_watchlist` | `query` | `WatchlistSearch.vue` (on blur, if query non-empty) |
| `add_watchlist_item` | `ticker`, `source` (`'search'` when applicable) | `AddWatchlistModal.vue`, `WatchlistSearch.vue` |
| `add_transaction` | `ticker`, `transaction_type` | `AddTransactionModal.vue` |
| `edit_transaction` | `ticker` | `EditTransactionModal.vue` |
| `log_dividend` | `ticker`, `drip` (bool) | `DividendModal.vue` |
| `create_alert` | `ticker` | `AlertModal.vue` (new alert) |
| `update_alert` | `ticker` | `AlertModal.vue` (existing alert) |
| `update_groups` | `ticker` | `GroupEditModal.vue` |
| `create_fee_profile` | — | `FeeProfilesModal.vue` |
| `update_fee_profile` | — | `FeeProfilesModal.vue` |

## Adding a new event

1. `import { trackEvent } from '@/composables/useAnalytics'`
2. Call `trackEvent('event_name', { ...params })` at the point of user action (not on mount/watch side effects).
3. Add a row to the table above.
