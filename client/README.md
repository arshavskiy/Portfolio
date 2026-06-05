# StockFolio Client

Vue 3 + Vite frontend for StockFolio.

## Key Screens

- Dashboard: markets, trending tickers, portfolio breakdown, totals, and a For You news preview.
- News: watchlist-based For You feed, topic filters, shared neon article cards, and infinite scroll.
- Holdings, watchlist, transactions, stock detail, alerts, profile, login, and register.

## News UI

News article rendering is shared through `src/components/charts/NewsArticleCard.vue`.

- `src/components/charts/NewsCard.vue`: compact dashboard preview using `topic=for-you`.
- `src/views/NewsView.vue`: full feed with topic chips and paged loading.

The frontend calls `/api/stocks/news` through `src/composables/useApi.js`; provider keys stay on the server.

## Development

```bash
npm install
npm run dev
npm run build
```
