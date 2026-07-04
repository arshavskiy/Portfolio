# StockFolio Project Documentation

## Overview

StockFolio is a personal portfolio tracker for stocks and TASE symbols. The app supports authentication, holdings, transaction lots, watchlists, fee profiles, P&L summaries, charts, personalized market news, and stock quotes/history from Yahoo Finance.

The repository is split into a Vite/Vue frontend and an Express/MongoDB backend.

## Project Structure

- `client/`: Vue 3 frontend built with Vite.
- `client/src/views/`: route-level pages such as dashboard, holdings, position details, transactions, watchlist, profile, login, and register.
- `client/src/components/`: reusable UI and chart components.
- `client/src/stores/`: Pinia stores for auth, portfolio, watchlist, and fee profiles.
- `client/src/composables/`: shared API and formatting helpers.
- `server/`: Express API.
- `server/index.js`: API entry point, MongoDB connection, CORS, request logging, and route registration.
- `server/routes/`: API route definitions.
- `server/controllers/`: request handlers and portfolio calculations.
- `server/models/`: Mongoose models for users, positions, transactions, watchlists, and fee profiles.
- `server/services/`: stock data, currency conversion, caching, and cron jobs.

## Core Features

- JWT authentication with persisted frontend session state.
- Portfolio positions with average cost, current quote, P&L, and multi-currency totals.
- Transaction lots with buy/sell fees, tax amounts, net proceeds, and running average cost.
- Buy/sell transaction modal with fixed-ticker mode, compact price input, market-price quick fill, sell-all action, and sell proceeds/profit simulation.
- Fee profiles for broker fees and capital gains tax simulation, including built-in read-only presets such as `בלינק Plus`.
- Dividend tracking with per-share annual dividend estimates, after-tax estimates, and share-weighted holding-time prorating for currently held shares.
- Watchlist and stock detail pages with quote/history data.
- Custom stock groups (multi-tag) with a group-by toggle on Dashboard, Holdings, and Watchlist.
- Price alerts via Web Push (VAPID), one-shot trigger, in-app toast notifications.
- Portfolio value-over-time chart, reconstructed from transaction history.
- Bulk import of holdings or watchlist from `.xlsx`/`.xls`/`.csv`/`.docx` files, with column auto-mapping and a downloadable template.
- Extended-hours (pre-market/after-hours) price and change data alongside regular session quotes.
- Per-market trading-hours status (US/Israel/Europe/Asia/Crypto) with open/closed state and countdowns.
- Dashboard top movers and gainers/losers cards across holdings and watchlist.
- Draggable point selection on stock charts for comparing two points in range.
- Guided in-app tour covering Dashboard movers, clickable tickers, Position details, chart range measuring, Watchlist tools, and Import.
- Tour replay from Account or by appending `?tour` to any authenticated app URL.
- Personalized News page with watchlist-driven For You articles, topic feeds, infinite scroll, and normalized article cards.
- Financial news provider chain: Marketaux first, Finnhub second, Yahoo Finance search fallback.
- TASE `.TA` support, including agorot-to-shekel normalization.
- PWA support through `vite-plugin-pwa` (injectManifest, Web Push handling in custom service worker).
- Financial disclaimer route linked from login/profile.
- Google Analytics page-view tracking in production when configured.

## Local Development

Install dependencies separately:

```bash
cd client && npm install
cd ../server && npm install
```

Run the API:

```bash
cd server
npm run dev
```

Run the frontend:

```bash
cd client
npm run dev
```

The Vite dev proxy sends `/api` requests to `http://localhost:3000` by default. Override it with `VITE_API_PROXY_TARGET`.

## Environment Variables

Backend variables are documented in `server/.env.example`:

- `PORT`: Express port.
- `MONGODB_URI`: MongoDB connection string.
- `JWT_SECRET`: signing secret for auth tokens.
- `JWT_EXPIRES_IN`: token lifetime.
- `CLIENT_URL`: comma-separated allowed frontend origins.
- `ALLOW_VERCEL_PREVIEWS`: allow `*.vercel.app` preview origins when not set to `false`.
- `NODE_ENV`: runtime environment.
- `MARKETAUX_API_TOKEN`: optional Marketaux token for paged and symbol-filtered financial news.
- `FINNHUB_API_KEY`: optional Finnhub token for general/crypto market news fallback.

Frontend variables are documented in `client/.env.example`:

- `VITE_API_URL`: deployed backend URL, usually the Railway service URL.
- `VITE_API_PROXY_TARGET`: local dev proxy target.
- `VITE_GA_MEASUREMENT_ID`: optional Google Analytics measurement ID; tracking runs only in production and respects browser Do Not Track.

## Deployment

Deploy `client/` to Vercel. Set `VITE_API_URL` to the Railway backend URL. `client/vercel.json` rewrites all routes to `index.html` so Vue Router pages such as `/position/AAPL` work on refresh.

Deploy `server/` to Railway. Set `CLIENT_URL` to the Vercel app URL and configure MongoDB/JWT secrets. The backend exposes `/api/health` for a simple health check.

## API Summary

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/portfolio`
- `POST /api/portfolio/transaction`
- `GET /api/portfolio/transactions`
- `PUT /api/portfolio/transaction/:id`
- `DELETE /api/portfolio/position/:id`
- `GET /api/stocks/search`
- `GET /api/stocks/quote/:ticker`
- `GET /api/stocks/history/:ticker`
- `GET /api/stocks/news`
- `GET|POST|DELETE /api/watchlist`
- `POST /api/watchlist/sync-holdings`
- `GET /api/portfolio/groups`
- `PUT /api/portfolio/position/:id/groups`
- `GET /api/portfolio/history`
- `GET|POST|PUT|DELETE /api/alerts`
- `GET /api/alerts/vapid-key`
- `POST /api/alerts/subscribe` / `POST /api/alerts/unsubscribe`
- `GET|POST|PUT|DELETE /api/fee-profiles`

Protected routes require an `Authorization: Bearer <token>` header.

Bulk import (holdings/watchlist from spreadsheet files) is parsed client-side via `client/src/composables/useImport.js` (SheetJS + mammoth for `.docx`) and submitted as ordinary `POST /api/portfolio/transaction` / `POST /api/watchlist` calls — there is no dedicated import endpoint.

## Feature Docs

- [News feature](NEWS.md): provider order, For You personalization, API shape, and frontend/backend files.
- [Architecture](ARCHITECTURE.md): guided tour flow, localStorage gates, and URL parameters.

## Verification

Use these checks before deployment:

```bash
cd client && npm test
cd client && npm run build
cd server && npm test
```

Manually verify login/register, adding transactions, opening holdings lots, sell simulation, watchlist changes, News topic switching/infinite scroll, and CORS from the deployed Vercel URL.
