# StockFolio

StockFolio is a mobile-first portfolio tracker for stocks, crypto, and global markets. It combines live quotes, holdings, watchlists, alerts, portfolio breakdowns, and personalized market news in a dark PWA interface.

## Features

- Live portfolio dashboard with P&L, multi-currency totals, market indices, trending tickers, and a personalized For You news preview.
- Holdings, transactions, average-cost tracking, fee profiles, and capital gains tax simulation.
- Watchlist-driven News page with For You, Markets, Tech, Financials, Crypto, Energy, Israel, and Positive topic feeds.
- Marketaux-first financial news integration with Finnhub and Yahoo Finance fallbacks.
- Infinite scroll news feed with normalized article cards, summaries, source labels, dates, and ticker tags.
- Price alerts with optional Web Push notifications.
- PWA support for installable mobile use.

## Project Layout

- `client/`: Vue 3 + Vite frontend.
- `server/`: Express + MongoDB API.
- `docs/`: project documentation, API reference, architecture notes, and feature flows.

## Development

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

## News Configuration

Configure news API keys in `server/.env`. Real keys must stay out of git.

```env
MARKETAUX_API_TOKEN=your_marketaux_api_token
FINNHUB_API_KEY=your_finnhub_api_key
```

Provider order is Marketaux, then Finnhub, then Yahoo Finance search fallback. Marketaux is used first because it supports symbol-filtered feeds for the watchlist-based For You topic and page-based infinite scroll.

## Documentation

- [Project docs](docs/README.md)
- [API reference](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Feature flows](docs/FLOWS.md)
