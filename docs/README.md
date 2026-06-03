# StockFolio Project Documentation

## Overview

StockFolio is a personal portfolio tracker for stocks and TASE symbols. The app supports authentication, holdings, transaction lots, watchlists, fee profiles, P&L summaries, charts, and stock quotes/history from Yahoo Finance.

The repository is split into a Vite/Vue frontend and an Express/MongoDB backend.

## Project Structure

- `client/`: Vue 3 frontend built with Vite.
- `client/src/views/`: route-level pages such as dashboard, holdings, position details, transactions, watchlist, profile, login, and register.
- `client/src/components/`: reusable UI and chart components.
- `client/src/stores/`: Pinia stores for auth, portfolio, watchlist, and fee profiles.
- `client/src/composables/`: shared API and formatting helpers.
- `server/`: Express API.
- `server/index.js`: API entry point, MongoDB connection, CORS, rate limiting, and route registration.
- `server/routes/`: API route definitions.
- `server/controllers/`: request handlers and portfolio calculations.
- `server/models/`: Mongoose models for users, positions, transactions, watchlists, and fee profiles.
- `server/services/`: stock data, currency conversion, caching, and cron jobs.

## Core Features

- JWT authentication with persisted frontend session state.
- Portfolio positions with average cost, current quote, P&L, and multi-currency totals.
- Transaction lots with buy/sell fees, tax amounts, net proceeds, and running average cost.
- Fee profiles for broker fees and capital gains tax simulation.
- Watchlist and stock detail pages with quote/history data.
- TASE `.TA` support, including agorot-to-shekel normalization.
- PWA support through `vite-plugin-pwa`.

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

Frontend variables are documented in `client/.env.example`:

- `VITE_API_URL`: deployed backend URL, usually the Railway service URL.
- `VITE_API_PROXY_TARGET`: local dev proxy target.

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
- `GET|POST|DELETE /api/watchlist`
- `GET|POST|PUT|DELETE /api/fee-profiles`

Protected routes require an `Authorization: Bearer <token>` header.

## Verification

Current automated testing is not configured. Use these checks before deployment:

```bash
cd client && npm run build
cd server && node --check index.js
```

Manually verify login/register, adding transactions, opening holdings lots, watchlist changes, and CORS from the deployed Vercel URL.
