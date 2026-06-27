const swaggerJsdoc = require('swagger-jsdoc')

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'StockFolio API',
      version: '1.0.0',
      description: 'REST API for StockFolio — portfolio tracking, watchlist, alerts, and market data.',
    },
    servers: [{ url: '/api', description: 'Default' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            ticker: { type: 'string', example: 'AAPL' },
            type: { type: 'string', enum: ['buy', 'sell', 'dividend'] },
            shares: { type: 'number', example: 10 },
            price: { type: 'number', example: 189.42 },
            date: { type: 'string', format: 'date-time' },
            notes: { type: 'string' },
            feeProfileId: { type: 'string', nullable: true },
            groups: { type: 'array', items: { type: 'string' } },
          },
        },
        Position: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            ticker: { type: 'string', example: 'AAPL' },
            companyName: { type: 'string' },
            shares: { type: 'number' },
            avgCost: { type: 'number' },
            groups: { type: 'array', items: { type: 'string' } },
          },
        },
        WatchlistItem: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            ticker: { type: 'string', example: 'AAPL' },
            companyName: { type: 'string' },
            groups: { type: 'array', items: { type: 'string' } },
          },
        },
        Alert: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            ticker: { type: 'string', example: 'AAPL' },
            condition: { type: 'string', enum: ['above', 'below'] },
            targetPrice: { type: 'number', example: 200 },
            active: { type: 'boolean' },
          },
        },
        FeeProfile: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string', example: 'Interactive Brokers' },
            isDefault: { type: 'boolean' },
            buyFee: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['percent', 'flat'] },
                value: { type: 'number' },
                minFee: { type: 'number' },
              },
            },
            sellFee: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['percent', 'flat'] },
                value: { type: 'number' },
                minFee: { type: 'number' },
              },
            },
            capitalGainsTax: { type: 'number', example: 25 },
          },
        },
        Quote: {
          type: 'object',
          properties: {
            ticker: { type: 'string' },
            name: { type: 'string' },
            price: { type: 'number' },
            change: { type: 'number' },
            changePercent: { type: 'number' },
            previousClose: { type: 'number' },
            volume: { type: 'number' },
            marketCap: { type: 'number', nullable: true },
            pe: { type: 'number', nullable: true },
            dividendYield: { type: 'number', nullable: true },
            marketState: { type: 'string', nullable: true },
            preMarketPrice: { type: 'number', nullable: true },
            postMarketPrice: { type: 'number', nullable: true },
          },
        },
        OHLCV: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date-time' },
            open: { type: 'number' },
            high: { type: 'number' },
            low: { type: 'number' },
            close: { type: 'number' },
            volume: { type: 'number' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Register, login, and current user' },
      { name: 'Portfolio', description: 'Holdings, transactions, dividends, and realized gains' },
      { name: 'Watchlist', description: 'Watchlist items and groups' },
      { name: 'Stocks', description: 'Quotes, history, search, markets, trending, news' },
      { name: 'Alerts', description: 'Price alerts and push subscriptions' },
      { name: 'Fee Profiles', description: 'Broker fee and tax profiles' },
    ],
    paths: {
      // ── Auth ──
      '/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new user',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'email', 'password'],
                  properties: {
                    name: { type: 'string', example: 'Pavel' },
                    email: { type: 'string', format: 'email', example: 'pavel@example.com' },
                    password: { type: 'string', example: 'Secret1!' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Created — returns JWT token', content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' } } } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Log in and receive a JWT',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email', example: 'pavel@example.com' },
                    password: { type: 'string', example: 'Secret1!' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'JWT token', content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' } } } } } },
            401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get the current authenticated user',
          responses: {
            200: { description: 'Current user', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      // ── Portfolio ──
      '/portfolio': {
        get: {
          tags: ['Portfolio'],
          summary: 'Get all positions with live quotes',
          responses: {
            200: { description: 'Array of positions', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Position' } } } } },
          },
        },
      },
      '/portfolio/history': {
        get: {
          tags: ['Portfolio'],
          summary: 'Portfolio value over time',
          parameters: [
            { name: 'range', in: 'query', schema: { type: 'string', enum: ['1mo', '3mo', '6mo', '1y', 'max'], default: '3mo' } },
          ],
          responses: {
            200: { description: 'Array of { date, value }', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, value: { type: 'number' } } } } } } },
          },
        },
      },
      '/portfolio/groups': {
        get: {
          tags: ['Portfolio'],
          summary: 'All group tags across positions and watchlist',
          responses: {
            200: { description: 'Array of tag strings', content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } } },
          },
        },
      },
      '/portfolio/transaction': {
        post: {
          tags: ['Portfolio'],
          summary: 'Add a buy / sell / dividend transaction',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['ticker', 'type', 'shares', 'price'],
                  properties: {
                    ticker: { type: 'string', example: 'AAPL' },
                    type: { type: 'string', enum: ['buy', 'sell', 'dividend'] },
                    shares: { type: 'number', example: 10 },
                    price: { type: 'number', example: 189.42 },
                    date: { type: 'string', format: 'date-time' },
                    notes: { type: 'string' },
                    feeProfileId: { type: 'string', nullable: true },
                    groups: { type: 'array', items: { type: 'string' } },
                    drip: { type: 'boolean', description: 'Dividend reinvestment (dividend type only)' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Transaction created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Transaction' } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/portfolio/transactions': {
        get: {
          tags: ['Portfolio'],
          summary: 'Get transaction history',
          parameters: [
            { name: 'ticker', in: 'query', schema: { type: 'string' }, description: 'Filter by ticker' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 500 } },
          ],
          responses: {
            200: { description: 'Transactions list', content: { 'application/json': { schema: { type: 'object', properties: { transactions: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } } } } } } },
          },
        },
      },
      '/portfolio/dividends/summary': {
        get: {
          tags: ['Portfolio'],
          summary: 'Dividend income summary per position',
          responses: {
            200: { description: 'Dividend summary', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } },
          },
        },
      },
      '/portfolio/realized-gains': {
        get: {
          tags: ['Portfolio'],
          summary: 'Realized gains / losses from closed lots',
          responses: {
            200: { description: 'Realized gains list', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } },
          },
        },
      },
      '/portfolio/transaction/{id}': {
        put: {
          tags: ['Portfolio'],
          summary: 'Update a transaction',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Transaction' } } } },
          responses: {
            200: { description: 'Updated transaction', content: { 'application/json': { schema: { $ref: '#/components/schemas/Transaction' } } } },
            404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        delete: {
          tags: ['Portfolio'],
          summary: 'Delete a transaction',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Deleted' },
            404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/portfolio/position/{id}/groups': {
        put: {
          tags: ['Portfolio'],
          summary: 'Update groups on a position',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { groups: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 200: { description: 'Updated' } },
        },
      },
      '/portfolio/position/{id}': {
        delete: {
          tags: ['Portfolio'],
          summary: 'Delete a position and all its transactions',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Deleted' } },
        },
      },

      // ── Watchlist ──
      '/watchlist': {
        get: {
          tags: ['Watchlist'],
          summary: 'Get all watchlist items with live quotes',
          responses: { 200: { description: 'Watchlist items', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/WatchlistItem' } } } } } },
        },
        post: {
          tags: ['Watchlist'],
          summary: 'Add a ticker to the watchlist',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['ticker'], properties: { ticker: { type: 'string', example: 'MSFT' }, groups: { type: 'array', items: { type: 'string' } } } } } } },
          responses: {
            201: { description: 'Item added', content: { 'application/json': { schema: { $ref: '#/components/schemas/WatchlistItem' } } } },
            409: { description: 'Already in watchlist', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/watchlist/item/{ticker}': {
        get: {
          tags: ['Watchlist'],
          summary: 'Get a single watchlist item by ticker',
          parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Watchlist item', content: { 'application/json': { schema: { $ref: '#/components/schemas/WatchlistItem' } } } } },
        },
      },
      '/watchlist/sync-holdings': {
        post: {
          tags: ['Watchlist'],
          summary: 'Sync watchlist to match current holdings',
          responses: { 200: { description: 'Synced' } },
        },
      },
      '/watchlist/{id}/groups': {
        put: {
          tags: ['Watchlist'],
          summary: 'Update groups on a watchlist item',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { groups: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 200: { description: 'Updated' } },
        },
      },
      '/watchlist/{id}': {
        delete: {
          tags: ['Watchlist'],
          summary: 'Remove a ticker from the watchlist',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Removed' } },
        },
      },

      // ── Stocks ──
      '/stocks/search': {
        get: {
          tags: ['Stocks'],
          summary: 'Search tickers — returns EQUITY, ETF, MUTUALFUND, CRYPTOCURRENCY, INDEX, FUTURE, CURRENCY',
          parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string', example: 'MSTY' } }],
          responses: { 200: { description: 'Search results', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { ticker: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' } } } } } } } },
        },
      },
      '/stocks/quote/{ticker}': {
        get: {
          tags: ['Stocks'],
          summary: 'Get a live quote for a ticker',
          parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string', example: 'AAPL' } }],
          responses: { 200: { description: 'Quote', content: { 'application/json': { schema: { $ref: '#/components/schemas/Quote' } } } } },
        },
      },
      '/stocks/history/{ticker}': {
        get: {
          tags: ['Stocks'],
          summary: 'OHLCV history for a ticker',
          parameters: [
            { name: 'ticker', in: 'path', required: true, schema: { type: 'string', example: 'AAPL' } },
            { name: 'range', in: 'query', schema: { type: 'string', enum: ['1d', '5d', '1mo', '3mo', '6mo', '1y', 'max'], default: '3mo' } },
            { name: 'points', in: 'query', schema: { type: 'integer' }, description: 'Downsample to at most N bars' },
          ],
          responses: { 200: { description: 'OHLCV bars', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/OHLCV' } } } } } },
        },
      },
      '/stocks/markets': {
        get: {
          tags: ['Stocks'],
          summary: 'Global market index quotes',
          parameters: [{ name: 'group', in: 'query', schema: { type: 'string', enum: ['US', 'Israel', 'Europe', 'Asia', 'Crypto'], default: 'US' } }],
          responses: { 200: { description: 'Market indices', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } } },
        },
      },
      '/stocks/trending': {
        get: {
          tags: ['Stocks'],
          summary: 'Trending tickers',
          parameters: [{ name: 'group', in: 'query', schema: { type: 'string', enum: ['US', 'Israel', 'Israel Tech', 'Crypto'], default: 'US' } }],
          responses: { 200: { description: 'Trending list', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } } },
        },
      },
      '/stocks/news': {
        get: {
          tags: ['Stocks'],
          summary: 'Market news feed',
          parameters: [
            { name: 'topic', in: 'query', schema: { type: 'string', enum: ['for-you', 'markets', 'tech', 'financials', 'crypto', 'energy', 'israel', 'positive'], default: 'markets' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 4 } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'symbols', in: 'query', schema: { type: 'string' }, description: 'Comma-separated tickers for personalised feed' },
          ],
          responses: { 200: { description: 'News articles', content: { 'application/json': { schema: { type: 'object', properties: { articles: { type: 'array', items: { type: 'object' } }, page: { type: 'integer' }, hasMore: { type: 'boolean' }, provider: { type: 'string' } } } } } } },
        },
      },
      '/stocks/news/article/{id}': {
        get: {
          tags: ['Stocks'],
          summary: 'Get a cached news article by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Article', content: { 'application/json': { schema: { type: 'object' } } } },
            404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/stocks/fx/ils-to-usd': {
        get: {
          tags: ['Stocks'],
          summary: 'ILS → USD exchange rate',
          responses: { 200: { description: 'Rate', content: { 'application/json': { schema: { type: 'object', properties: { rate: { type: 'number', example: 0.27 } } } } } } },
        },
      },

      // ── Alerts ──
      '/alerts/vapid-key': {
        get: {
          tags: ['Alerts'],
          summary: 'Get the VAPID public key for Web Push',
          security: [],
          responses: { 200: { description: 'VAPID key', content: { 'application/json': { schema: { type: 'object', properties: { publicKey: { type: 'string' } } } } } } },
        },
      },
      '/alerts/subscribe': {
        post: {
          tags: ['Alerts'],
          summary: 'Register a push subscription',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { subscription: { type: 'object' } } } } } },
          responses: { 200: { description: 'Subscribed' } },
        },
      },
      '/alerts/unsubscribe': {
        post: {
          tags: ['Alerts'],
          summary: 'Remove a push subscription',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { endpoint: { type: 'string' } } } } } },
          responses: { 200: { description: 'Unsubscribed' } },
        },
      },
      '/alerts': {
        get: {
          tags: ['Alerts'],
          summary: 'Get all price alerts for the user',
          responses: { 200: { description: 'Alerts list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Alert' } } } } } },
        },
        post: {
          tags: ['Alerts'],
          summary: 'Create a price alert',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['ticker', 'condition', 'targetPrice'],
                  properties: {
                    ticker: { type: 'string', example: 'AAPL' },
                    condition: { type: 'string', enum: ['above', 'below'] },
                    targetPrice: { type: 'number', example: 200 },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Alert' } } } } },
        },
      },
      '/alerts/{id}': {
        put: {
          tags: ['Alerts'],
          summary: 'Update a price alert',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Alert' } } } },
          responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Alert' } } } } },
        },
        delete: {
          tags: ['Alerts'],
          summary: 'Delete a price alert',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Deleted' } },
        },
      },

      // ── Fee Profiles ──
      '/fee-profiles': {
        get: {
          tags: ['Fee Profiles'],
          summary: 'Get all fee profiles',
          responses: { 200: { description: 'Fee profiles', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/FeeProfile' } } } } } },
        },
        post: {
          tags: ['Fee Profiles'],
          summary: 'Create a fee profile',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/FeeProfile' } } } },
          responses: { 201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/FeeProfile' } } } } },
        },
      },
      '/fee-profiles/{id}': {
        put: {
          tags: ['Fee Profiles'],
          summary: 'Update a fee profile',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/FeeProfile' } } } },
          responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/FeeProfile' } } } } },
        },
        delete: {
          tags: ['Fee Profiles'],
          summary: 'Delete a fee profile',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Deleted' } },
        },
      },

      // ── Health ──
      '/health': {
        get: {
          tags: [],
          summary: 'Health check',
          security: [],
          responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } } } } } },
        },
      },
    },
  },
  apis: [],
})

module.exports = spec
