# News Feature

StockFolio includes a personalized market news experience on the dashboard and the dedicated News page.

## User Experience

- Dashboard `For You` card: compact preview of watchlist-driven news.
- News page: full feed with topic chips, shared neon article cards, and infinite scroll.
- Topics: `For You`, `Markets`, `Tech`, `Financials`, `Crypto`, `Energy`, `Israel`, and `Positive`.
- Article cards show source, publish time, title, summary, and ticker tags when provided by the news provider.

## Personalization

The `For You` topic is resolved on the backend:

1. Read the authenticated user's watchlist tickers.
2. Pass up to 20 tickers as Marketaux `symbols`.
3. If the watchlist is empty, fall back to the `markets` topic.

This keeps provider keys and watchlist lookup logic out of the frontend.

## API

Frontend calls:

```http
GET /api/stocks/news?topic=for-you&limit=3&page=1
```

Response shape:

```json
{
  "topic": "for-you",
  "resolvedTopic": "for-you",
  "provider": "marketaux",
  "page": 1,
  "hasMore": true,
  "topics": [{ "value": "for-you", "label": "For You" }],
  "articles": []
}
```

## Providers

Provider order (English, default):

1. Marketaux
2. Finnhub
3. Yahoo Finance search fallback

Marketaux is preferred because it supports symbol filtering and pagination. Finnhub and Yahoo are treated as first-page fallbacks.

### Russian locale (`lang=ru`)

When the request carries `lang=ru` **and** `GNEWS_API_KEY` is set, GNews is tried first with per-topic Russian search queries (`ruQuery` in `NEWS_TOPICS`, e.g. `фондовый рынок новости`). The English chain above remains the fallback, so Russian users always get articles even without a GNews key — just in English. The client news store (`stores/news.js`) appends `lang=ru` automatically when the app locale is Russian. News cache keys are lang-scoped.

Required server environment variables:

```env
MARKETAUX_API_TOKEN=your_marketaux_api_token
FINNHUB_API_KEY=your_finnhub_api_key
GNEWS_API_KEY=your_gnews_api_key   # optional: Russian-language articles (free tier: gnews.io)
```

All are optional, but production news quality is best when Marketaux is configured.

## Frontend Files

- `client/src/components/charts/NewsArticleCard.vue`: shared article card.
- `client/src/components/charts/NewsCard.vue`: dashboard preview.
- `client/src/views/NewsView.vue`: full feed, topic selection, infinite scroll.
- `client/src/views/NewsArticleView.vue`: article details page backed by server cache plus session fallback.
- `client/src/components/ui/BottomNav.vue`: News nav entry.
- `client/src/views/LoginView.vue`: landing slideshow and feature list.

## Backend Files

- `server/routes/stocks.js`: registers `/api/stocks/news`.
- `server/controllers/stockController.js`: handles topic resolution, watchlist symbols, and article lookup.
- `server/services/stockService.js`: provider calls, normalization, article IDs, caching, and pagination metadata.

## Verification

```bash
cd server
node --check services/stockService.js
node --check controllers/stockController.js

cd ../client
npm run build
```
