const OpenAI = require('openai')
const Position = require('../models/Position')
const Watchlist = require('../models/Watchlist')
const Transaction = require('../models/Transaction')
const AiChatMessage = require('../models/AiChatMessage')
const {getQuotes, getMarketNews, getHistory} = require('./stockService')

const HISTORY_LIMIT = 50

const MODEL = 'gpt-4o-mini'
const DAILY_LIMIT = 20
const QUESTION_MAX_LENGTH = 500
const MAX_TOOL_ROUNDS = 4
const VALID_RANGES = ['1mo', '3mo', '6mo', '1y', '5y', 'max']

// Per-user daily request counter, in-memory — mirrors the quote/news cache
// pattern already used elsewhere in this service layer. Resets on restart,
// which is an acceptable tradeoff for a soft cost guard rather than a hard
// billing limit.
const requestCounts = new Map() // userId -> {count, dayKey}

function dayKey() {
    return new Date().toISOString().split('T')[0]
}

function checkAndIncrementLimit(userId) {
    const key = String(userId)
    const today = dayKey()
    const entry = requestCounts.get(key)
    if (!entry || entry.dayKey !== today) {
        requestCounts.set(key, {count: 1, dayKey: today})
        return true
    }
    if (entry.count >= DAILY_LIMIT) return false
    entry.count++
    return true
}

let client = null

function getClient() {
    if (!process.env.OPENAI_API_KEY) return null
    if (!client) client = new OpenAI({apiKey: process.env.OPENAI_API_KEY})
    return client
}

async function buildPortfolioContext(userId) {
    const [positions, watchlist] = await Promise.all([
        Position.find({user: userId}).lean(),
        Watchlist.find({user: userId}).lean(),
    ])

    const heldTickers = new Set(positions.map((p) => p.ticker))
    const watchOnly = watchlist.filter((w) => !heldTickers.has(w.ticker))

    if (!positions.length && !watchOnly.length) {
        return {contextText: 'The user has no holdings and an empty watchlist.', tickers: []}
    }

    const allTickers = [...new Set([...positions.map((p) => p.ticker), ...watchOnly.map((w) => w.ticker)])]
    const quotes = await getQuotes(allTickers)
    const quoteMap = Object.fromEntries(quotes.filter(Boolean).map((q) => [q.ticker, q]))

    const holdingsText = positions.length
        ? positions
            .map((p) => {
                const q = quoteMap[p.ticker] || {}
                const price = q.price ?? null
                const changePercent = q.changePercent ?? null
                return `${p.ticker} (${p.companyName || p.ticker}): ${p.shares} shares, avg cost ${p.avgCost?.toFixed(2)}, ` +
                    `current price ${price ?? 'n/a'}, today ${changePercent != null ? changePercent.toFixed(2) + '%' : 'n/a'}, ` +
                    `sector ${p.sector || 'unknown'}, dividend yield ${q.dividendYield ?? 'n/a'}`
            })
            .join('\n')
        : 'None.'

    const watchlistText = watchOnly.length
        ? watchOnly
            .map((w) => {
                const q = quoteMap[w.ticker] || {}
                const price = q.price ?? null
                const changePercent = q.changePercent ?? null
                return `${w.ticker} (${w.companyName || w.ticker}): current price ${price ?? 'n/a'}, ` +
                    `today ${changePercent != null ? changePercent.toFixed(2) + '%' : 'n/a'}, sector ${w.sector || 'unknown'}`
            })
            .join('\n')
        : 'None.'

    const contextText = `Current holdings (stocks the user owns):\n${holdingsText}\n\n` +
        `Watchlist (stocks the user is tracking but does NOT own):\n${watchlistText}\n\n` +
        `All ticker symbols the user tracks: ${allTickers.join(', ')}.`

    return {contextText, tickers: allTickers}
}

async function buildNewsContext(tickers) {
    if (!tickers.length) return ''
    try {
        const data = await getMarketNews(5, 'markets', 1, {symbols: tickers})
        const articles = Array.isArray(data) ? data : data.articles || []
        if (!articles.length) return ''
        return '\n\nRecent news headlines:\n' + articles.slice(0, 5).map((a) => `- ${a.title}`).join('\n')
    } catch {
        return ''
    }
}

// ── Tools the model can call mid-conversation for data that isn't worth
// putting in every request's static context (price history, transactions,
// realized gains, dividend totals) — keeps the base prompt small and lets
// the model only fetch what a given question actually needs. ─────────────

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'get_price_return',
            description: 'Get a ticker\'s percentage price change over a given period, computed from daily closing prices. Use this for any "best/worst performer over X" or "how has TICKER done over X" question.',
            parameters: {
                type: 'object',
                properties: {
                    tickers: {type: 'array', items: {type: 'string'}, description: 'Ticker symbols to check, e.g. ["AAPL", "GOOGL"]'},
                    range: {type: 'string', enum: VALID_RANGES, description: 'Lookback period'},
                },
                required: ['tickers', 'range'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_transactions',
            description: 'Get the user\'s raw transaction history (buys, sells, dividends), optionally filtered by ticker.',
            parameters: {
                type: 'object',
                properties: {
                    ticker: {type: 'string', description: 'Optional ticker to filter to'},
                    limit: {type: 'number', description: 'Max transactions to return, default 20'},
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_realized_gains',
            description: 'Get realized capital gains/losses from sells, grouped by year, computed using the avg-cost method. Optionally filter to one year.',
            parameters: {
                type: 'object',
                properties: {
                    year: {type: 'number', description: 'Optional calendar year to filter to'},
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_dividend_summary',
            description: 'Get total dividends received per ticker, all-time.',
            parameters: {type: 'object', properties: {}},
        },
    },
]

async function toolGetPriceReturn(userId, args) {
    const tickers = Array.isArray(args?.tickers) ? args.tickers.slice(0, 15) : []
    const range = VALID_RANGES.includes(args?.range) ? args.range : '3mo'
    if (!tickers.length) return {error: 'no tickers provided'}

    const histories = await Promise.all(tickers.map((t) => getHistory(t, range).catch(() => [])))
    const results = tickers.map((ticker, i) => {
        const closes = (histories[i] || []).filter((r) => r.close != null)
        if (closes.length < 2) return {ticker, range, returnPercent: null}
        const first = closes[0].close
        const last = closes[closes.length - 1].close
        const returnPercent = first > 0 ? Math.round(((last - first) / first) * 10000) / 100 : null
        return {ticker, range, returnPercent}
    })
    return {results}
}

async function toolGetTransactions(userId, args) {
    const query = {user: userId}
    if (args?.ticker) query.ticker = String(args.ticker).toUpperCase()
    const limit = Math.min(Number(args?.limit) || 20, 50)
    const txs = await Transaction.find(query).sort({date: -1}).limit(limit).lean()
    return {
        transactions: txs.map((t) => ({
            ticker: t.ticker,
            type: t.type,
            shares: t.shares,
            price: t.price,
            total: t.total,
            date: t.date,
            drip: t.drip,
        })),
    }
}

async function toolGetRealizedGains(userId, args) {
    const yearFilter = args?.year ? Number(args.year) : null
    const allTx = await Transaction.find({user: userId, type: {$in: ['buy', 'sell']}}).sort({date: 1}).lean()

    const state = {}
    const sells = []
    for (const tx of allTx) {
        const t = tx.ticker
        if (!state[t]) state[t] = {shares: 0, cost: 0}
        if (tx.type === 'buy') {
            state[t].cost += tx.shares * tx.price
            state[t].shares += tx.shares
        } else {
            const avgCost = state[t].shares > 0 ? state[t].cost / state[t].shares : 0
            const costBasis = avgCost * tx.shares
            const proceeds = tx.total || tx.shares * tx.price
            sells.push({
                ticker: t,
                date: tx.date,
                year: new Date(tx.date).getFullYear(),
                shares: tx.shares,
                proceeds: Math.round(proceeds * 100) / 100,
                costBasis: Math.round(costBasis * 100) / 100,
                gain: Math.round((proceeds - costBasis) * 100) / 100,
            })
            state[t].cost -= costBasis
            state[t].shares -= tx.shares
            if (state[t].shares <= 0) { state[t].shares = 0; state[t].cost = 0 }
        }
    }

    const filtered = yearFilter ? sells.filter((s) => s.year === yearFilter) : sells
    const totalGain = Math.round(filtered.reduce((sum, s) => sum + s.gain, 0) * 100) / 100
    return {sells: filtered, totalGain}
}

async function toolGetDividendSummary(userId) {
    const dividends = await Transaction.find({user: userId, type: 'dividend'}).lean()
    const byTicker = {}
    for (const d of dividends) {
        if (!byTicker[d.ticker]) byTicker[d.ticker] = {ticker: d.ticker, total: 0, count: 0}
        byTicker[d.ticker].total += d.total || 0
        byTicker[d.ticker].count++
    }
    const summary = Object.values(byTicker).map((r) => ({...r, total: Math.round(r.total * 100) / 100}))
    const grandTotal = Math.round(summary.reduce((s, r) => s + r.total, 0) * 100) / 100
    return {summary, grandTotal}
}

const TOOL_HANDLERS = {
    get_price_return: toolGetPriceReturn,
    get_transactions: toolGetTransactions,
    get_realized_gains: toolGetRealizedGains,
    get_dividend_summary: toolGetDividendSummary,
}

async function runTool(userId, name, argsJson) {
    const handler = TOOL_HANDLERS[name]
    if (!handler) return {error: `unknown tool ${name}`}
    let args = {}
    try {
        args = argsJson ? JSON.parse(argsJson) : {}
    } catch {
        return {error: 'invalid tool arguments'}
    }
    try {
        return await handler(userId, args)
    } catch (err) {
        return {error: err.message}
    }
}

async function askAboutPortfolio(userId, question) {
    const openai = getClient()
    if (!openai) {
        const err = new Error('AI Q&A is not configured')
        err.status = 503
        throw err
    }

    const trimmed = String(question || '').trim().slice(0, QUESTION_MAX_LENGTH)
    if (!trimmed) {
        const err = new Error('question is required')
        err.status = 400
        throw err
    }

    if (!checkAndIncrementLimit(userId)) {
        const err = new Error('Daily question limit reached')
        err.status = 429
        throw err
    }

    await AiChatMessage.create({user: userId, role: 'user', text: trimmed})

    const {contextText, tickers} = await buildPortfolioContext(userId)
    const newsText = await buildNewsContext(tickers)

    const messages = [
        {
            role: 'system',
            content: 'You are a portfolio analysis assistant inside a personal stock tracking app. ' +
                'Answer questions about the user\'s holdings AND watchlist using the context provided plus the ' +
                'tools available to you — call get_price_return for any "best/worst performer over X" or ' +
                'historical-return question (it is NOT in the static context), get_transactions/get_realized_gains/' +
                'get_dividend_summary for questions about trade history, gains, or dividends received. The static ' +
                'context clearly separates stocks the user owns from stocks they are only watching; keep that ' +
                'distinction clear in your answer. Be concise (3-5 sentences). You are not a licensed financial ' +
                'advisor — do not give personalized investment recommendations; describe what the data shows instead.',
        },
        {role: 'system', content: contextText + newsText},
        {role: 'user', content: trimmed},
    ]

    let completion
    let totalPromptTokens = 0
    let totalCompletionTokens = 0
    try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            completion = await openai.chat.completions.create({
                model: MODEL,
                messages,
                tools: TOOLS,
                max_tokens: 400,
            })
            totalPromptTokens += completion.usage?.prompt_tokens ?? 0
            totalCompletionTokens += completion.usage?.completion_tokens ?? 0

            const choice = completion.choices[0]
            const toolCalls = choice?.message?.tool_calls
            if (!toolCalls?.length) break

            messages.push(choice.message)
            const results = await Promise.all(
                toolCalls.map((call) => runTool(userId, call.function.name, call.function.arguments))
            )
            toolCalls.forEach((call, i) => {
                messages.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    content: JSON.stringify(results[i]),
                })
            })
        }
    } catch (cause) {
        // Re-thrown with a 502 regardless of the upstream status — a raw 401/403
        // from OpenAI must never reach the client as-is, since useApi.js treats
        // any 401 response from *this* API as "your session expired" and logs
        // the user out.
        const err = new Error('AI Q&A upstream request failed - ' + cause.message)
        err.status = 502
        await AiChatMessage.create({user: userId, role: 'error', text: err.message})
        throw err
    }

    const answer = completion.choices[0]?.message?.content?.trim() || ''
    const usage = {promptTokens: totalPromptTokens || null, completionTokens: totalCompletionTokens || null}
    await AiChatMessage.create({user: userId, role: 'assistant', text: answer, usage})

    return {answer, usage}
}

async function getChatHistory(userId) {
    const messages = await AiChatMessage.find({user: userId})
        .sort({createdAt: 1})
        .limit(HISTORY_LIMIT)
        .lean()
    return messages.map((m) => ({role: m.role, text: m.text, usage: m.usage, createdAt: m.createdAt}))
}

async function clearChatHistory(userId) {
    await AiChatMessage.deleteMany({user: userId})
}

module.exports = {askAboutPortfolio, getChatHistory, clearChatHistory}
