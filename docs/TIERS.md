# Feature Tiers

## Tier Definitions

| Tier | `userType` value | `canUsePremiumFeatures` |
|------|-----------------|------------------------|
| Regular | `regular` | `false` |
| Pro | `pro` | `true` |
| Max | `max` | `true` |
| Admin | `admin` | `true` |

Set via `User.userType` in MongoDB. Default: `regular`.

---

## Feature Access by Page

### Dashboard (Mobile — `DashboardView.vue`)

| Feature | Regular | Premium |
|---------|---------|---------|
| Portfolio Stats | ✅ | ✅ |
| AI Daily Summary | ✅ | ✅ |
| Markets | ✅ | ✅ |
| Top Movers | ✅ | ✅ |
| Allocation (Breakdown) | ✅ | ✅ |
| Trending | ✅ | ✅ |
| Portfolio History | ✅ | ✅ |
| Compare | ✅ | ✅ |
| Dividend Calendar | ✅ | ✅ |
| Income Projection | 👑 locked in Edit Home | ✅ |

Edit Home customization: Income Projection row shows amber crown and is disabled for regular users.

---

### Dashboard (Desktop — `DesktopDashboardView.vue`)

| Feature | Regular | Premium |
|---------|---------|---------|
| Net Worth / History Chart | ✅ | ✅ |
| Allocation | ✅ | ✅ |
| Top Movers | ✅ | ✅ |
| Dividend Calendar / Trending | ✅ | ✅ |
| Markets | ✅ | ✅ |
| Holdings table | ✅ | ✅ |
| Compare Chart | ✅ | ✅ |
| Income Projection | 👑 crown teaser card | ✅ |

---

### Assets Page (`AssetsView.vue`)

| Feature | Regular | Premium |
|---------|---------|---------|
| Asset table (all holdings) | ✅ | ✅ |
| Bulk archive / delete / export | ✅ | ✅ |
| Income Projection chart | 👑 crown teaser card | ✅ |

---

### Position Detail (`PositionDetailView.vue`)

| Feature | Regular | Premium |
|---------|---------|---------|
| Price chart | ✅ | ✅ |
| Price targets / alerts | ✅ | ✅ |
| Buy / Sell simulators | ✅ | ✅ |
| Transactions list | ✅ | ✅ |
| Dividend history | ✅ | ✅ |
| Position journal (notes) | ✅ | ✅ |
| Ticker Insight card | 👑 crown teaser | ✅ |
| Ticker Headlines (Analyst Research) | 👑 crown teaser | ✅ |
| Related Tickers graph | 👑 crown teaser | ✅ |

---

### Navigation

| Item | Regular | Premium |
|------|---------|---------|
| Dashboard | ✅ | ✅ |
| Watchlist | ✅ | ✅ |
| Assets | ✅ | ✅ |
| Records | ✅ | ✅ |
| X-Ray (desktop) | 👑 hidden | ✅ |
| News | ✅ | ✅ |
| AI Assistant (desktop) | 👑 hidden | ✅ |
| Insights — Health / Income tabs (desktop) | 👑 hidden | ✅ |
| Insights (mobile bottom nav) | 👑 hidden | ✅ |
| Alerts | ✅ | ✅ |
| Fee Profiles | ✅ | ✅ |

---

## Crown Teaser Pattern

When a premium feature is hidden from regular users, the UI shows a placeholder card with:
- Amber crown icon (`pi pi-crown`, `color: #f59e0b`)
- Feature name
- "Premium feature" label

Pages using this pattern: Assets, Desktop Dashboard, Position Detail (×3).
