# StockFolio — Feature Reference

> **Internal reference. Deliberately not surfaced in the UI.**
>
> This list previously rendered on the About page (`aboutPage.features`) and the public
> login page (`login.features.*`). It was removed from both on purpose — publishing an
> itemised capability list hands competitors a copy-paste-ready spec sheet. The user-facing
> surfaces now carry short summary prose instead (`aboutPage.summary`, `login.summary`).
>
> **Do not wire this back into the client.** If a feature list is ever needed in the product
> again, that's a product decision to raise explicitly — not a "restore the missing content"
> cleanup.

Kept here because it remains a useful reference for onboarding, release notes, and marketing
copy written outside the app.

---

## Portfolio & Tracking

- Live portfolio tracking with P&L, multi-currency USD/ILS totals, and a value-over-time chart that can be benchmarked against the S&P 500 or TA-125
- Coverage for US stocks, the Tel Aviv exchange, global markets, and crypto — pre-market and after-hours moves shown next to regular session quotes
- Line and candlestick charts with pre/after-hours colouring, delta measurement, and volume
- Custom multi-tag groups with group-by views across holdings and watchlist, plus a dedicated assets table for bulk edits

## Transactions, Fees & Tax

- Buy and sell transactions with per-broker fee profiles, so commissions and capital-gains tax are folded into every gain and simulation
- Realized gains grouped by tax year, full dividend history, and CSV export for all of it
- Every trade, realized gain, and historical dividend payment logged and filterable, with CSV export for tax season

## Income & Dividends

- Cash dividends and reinvested DRIP shares tracked with full lot history
- Dividend forecasting with a payout calendar, per-ticker income breakdown, and ex-dividend reminders

## Analysis & Risk

- Portfolio X-Ray: concentration, sector and geographic exposure, correlation, and a stress test against market shocks — rules-based health check flagging issues with pass / watch / risk badges *(Premium)*
- Return metrics beyond simple P&L — money-weighted IRR, time-weighted return, and portfolio beta
- News-driven ticker insight: sentiment tags, insider activity, earnings beat rate, and a market map of tickers that move together in the news

## AI

- AI assistant answering plain-English questions about your own holdings, backed by live portfolio data *(Premium)*
- Optional AI daily summary recapping holdings, watchlist, and main markets each morning

## Planning

- Rebalancing planner with target weights, and buy/sell simulators to preview a trade's fees, tax, and effect before committing
- Price alerts delivered as push notifications, plus drift alerts when allocation strays from target

## News

- Market stories personalised to your watchlist, with topic feeds for fast scanning

## Data & Platform

- Bulk import from Excel, CSV, or Word with automatic column mapping
- Installable as an app on phone or desktop, with offline support
