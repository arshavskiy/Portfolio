const OpenAI = require('openai')
const User = require('../models/User')
const Position = require('../models/Position')
const Watchlist = require('../models/Watchlist')
const Transaction = require('../models/Transaction')
const AiChatMessage = require('../models/AiChatMessage')
const {getQuotes, getMarketNews, getHistory, getIlsToUsd, getMarkets} = require('./stockService')
const {getPortfolioHistory} = require('./historyService')
const {computeXirr, computeTwr} = require('./returnMetrics')

const HISTORY_LIMIT = 50

const MODEL = 'gpt-4o-mini'
const REGULAR_DAILY_LIMIT = 3
const QUESTION_MAX_LENGTH = 500
const MAX_TOOL_ROUNDS = 4
const VALID_RANGES = ['1mo', '3mo', '6mo', '1y', '5y', 'max']
const UNLIMITED_USER_TYPES = new Set(['pro', 'max', 'admin', 'plan'])

function round(value, digits = 2) {
    if (value == null || !Number.isFinite(value)) return null
    const factor = 10 ** digits
    return Math.round(value * factor) / factor
}

function tickerFx(ticker, ilsToUsd) {
    return String(ticker || '').toUpperCase().endsWith('.TA') ? ilsToUsd : 1
}

function dayKey(now = new Date()) {
    return now.toISOString().split('T')[0]
}

async function consumeQuestionQuota(userId, now = new Date()) {
    const user = await User.findById(userId)
    if (!user) {
        const err = new Error('User not found')
        err.status = 404
        throw err
    }

    const resolvedUserType = user.userType || 'regular'

    const today = dayKey(now)
    const currentUsage = user.aiUsage || {}
    const currentDayKey = currentUsage.dayKey || null
    const currentQuestionCount = Number.isFinite(currentUsage.questionCount) ? currentUsage.questionCount : 0
    const nextQuestionCount = currentDayKey === today ? currentQuestionCount + 1 : 1

    if (!UNLIMITED_USER_TYPES.has(resolvedUserType) && currentDayKey === today && currentQuestionCount >= REGULAR_DAILY_LIMIT) {
        const err = new Error('Daily question limit reached')
        err.status = 429
        throw err
    }

    user.aiUsage = {dayKey: today, questionCount: nextQuestionCount}
    await user.save()
    return resolvedUserType
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

async function buildMarketsContext() {
    try {
        const indices = await getMarkets('US')
        if (!indices.length) return ''
        const text = indices
            .map((m) => `${m.name} (${m.symbol}): ${m.price ?? 'n/a'}, today ${m.changePercent != null ? m.changePercent.toFixed(2) + '%' : 'n/a'}`)
            .join('\n')
        return '\n\nMain market indices today:\n' + text
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
    {
        type: 'function',
        function: {
            name: 'get_portfolio_summary',
            description: 'Get current portfolio value, cost, P&L, day P&L, largest positions, dividend payers, and watchlist count. Use this for overview, concentration, allocation, and "what should I look at" questions.',
            parameters: {type: 'object', properties: {}},
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_risk_exposure',
            description: 'Get sector allocation and portfolio-weighted beta. Use this for diversification, concentration, sector exposure, beta, and stress-test questions.',
            parameters: {type: 'object', properties: {}},
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_return_metrics',
            description: 'Get money-weighted return (IRR/XIRR) and time-weighted return (TWR), optionally over a range. Use this for performance quality, IRR, TWR, and portfolio return questions.',
            parameters: {
                type: 'object',
                properties: {
                    range: {type: 'string', enum: ['1mo', '3mo', '6mo', '1y', 'max', 'all'], description: 'Lookback range for the daily TWR series. Defaults to all.'},
                },
            },
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

async function toolGetPortfolioSummary(userId) {
    const [positions, watchlist, ilsToUsd] = await Promise.all([
        Position.find({user: userId}).lean(),
        Watchlist.find({user: userId}).lean(),
        getIlsToUsd(),
    ])
    if (!positions.length) {
        return {
            totalValueUsd: 0,
            totalCostUsd: 0,
            pnlUsd: 0,
            pnlPercent: null,
            dayPnlUsd: 0,
            dayPnlPercent: null,
            positions: [],
            watchlistCount: watchlist.length,
        }
    }

    const quotes = await getQuotes(positions.map((p) => p.ticker))
    const quoteMap = Object.fromEntries(quotes.filter(Boolean).map((q) => [q.ticker, q]))
    const enriched = positions.map((p) => {
        const q = quoteMap[p.ticker] || {}
        const fx = tickerFx(p.ticker, ilsToUsd)
        const price = q.price || 0
        const valueUsd = price * p.shares * fx
        const costUsd = (p.avgCost || 0) * p.shares * fx
        const dayPnlUsd = (q.change || 0) * p.shares * fx
        const pnlUsd = valueUsd - costUsd
        return {
            ticker: p.ticker,
            companyName: p.companyName || p.ticker,
            sector: p.sector || 'Unknown',
            shares: p.shares,
            valueUsd: round(valueUsd),
            costUsd: round(costUsd),
            pnlUsd: round(pnlUsd),
            pnlPercent: costUsd > 0 ? round((pnlUsd / costUsd) * 100) : null,
            dayPnlUsd: round(dayPnlUsd),
            dayPnlPercent: valueUsd - dayPnlUsd > 0 ? round((dayPnlUsd / (valueUsd - dayPnlUsd)) * 100) : null,
            dividendYield: q.dividendYield ?? null,
        }
    })

    const totalValueUsd = enriched.reduce((sum, p) => sum + (p.valueUsd || 0), 0)
    const totalCostUsd = enriched.reduce((sum, p) => sum + (p.costUsd || 0), 0)
    const dayPnlUsd = enriched.reduce((sum, p) => sum + (p.dayPnlUsd || 0), 0)
    const heldTickers = new Set(positions.map((p) => p.ticker))
    const watchOnlyCount = watchlist.filter((w) => !heldTickers.has(w.ticker)).length

    return {
        totalValueUsd: round(totalValueUsd),
        totalCostUsd: round(totalCostUsd),
        pnlUsd: round(totalValueUsd - totalCostUsd),
        pnlPercent: totalCostUsd > 0 ? round(((totalValueUsd - totalCostUsd) / totalCostUsd) * 100) : null,
        dayPnlUsd: round(dayPnlUsd),
        dayPnlPercent: totalValueUsd - dayPnlUsd > 0 ? round((dayPnlUsd / (totalValueUsd - dayPnlUsd)) * 100) : null,
        largestPositions: enriched
            .map((p) => ({...p, allocationPercent: totalValueUsd > 0 ? round(((p.valueUsd || 0) / totalValueUsd) * 100) : null}))
            .sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0))
            .slice(0, 8),
        dividendPayerCount: enriched.filter((p) => Number(p.dividendYield) > 0).length,
        positionCount: positions.length,
        watchOnlyCount,
    }
}

async function toolGetRiskExposure(userId) {
    const positions = await Position.find({user: userId}).lean()
    if (!positions.length) return {sectors: [], weightedBeta: null, totalValueUsd: 0}

    const [quotes, ilsToUsd] = await Promise.all([getQuotes(positions.map((p) => p.ticker)), getIlsToUsd()])
    const quoteMap = Object.fromEntries(quotes.filter(Boolean).map((q) => [q.ticker, q]))
    const enriched = positions.map((p) => {
        const valueUsd = (quoteMap[p.ticker]?.price || 0) * p.shares * tickerFx(p.ticker, ilsToUsd)
        const beta = typeof p.beta === 'number' && Number.isFinite(p.beta) ? p.beta : 1
        return {ticker: p.ticker, sector: p.sector || 'Unknown', valueUsd, beta}
    })
    const totalValueUsd = enriched.reduce((sum, p) => sum + p.valueUsd, 0)
    if (totalValueUsd <= 0) return {sectors: [], weightedBeta: null, totalValueUsd: 0}

    const sectorTotals = {}
    for (const p of enriched) sectorTotals[p.sector] = (sectorTotals[p.sector] || 0) + p.valueUsd

    return {
        totalValueUsd: round(totalValueUsd),
        weightedBeta: round(enriched.reduce((sum, p) => sum + p.beta * (p.valueUsd / totalValueUsd), 0), 3),
        sectors: Object.entries(sectorTotals)
            .map(([sector, valueUsd]) => ({sector, valueUsd: round(valueUsd), percent: round((valueUsd / totalValueUsd) * 100)}))
            .sort((a, b) => b.valueUsd - a.valueUsd),
    }
}

async function toolGetReturnMetrics(userId, args) {
    const range = ['1mo', '3mo', '6mo', '1y', 'max', 'all'].includes(args?.range) ? args.range : 'all'
    const [txs, positions, ilsToUsd, dailySeries] = await Promise.all([
        Transaction.find({user: userId}).sort({date: 1}).lean(),
        Position.find({user: userId}).lean(),
        getIlsToUsd(),
        getPortfolioHistory(userId, range),
    ])
    if (!txs.length) return {range, irr: null, twr: null}

    const cashFlows = txs
        .map((t) => {
            const amountNative = t.type === 'sell' ? (t.netProceeds ?? t.total) : -(t.totalWithFees ?? t.total)
            if (t.type === 'dividend' && t.drip) return null
            if (t.type === 'dividend' && !t.drip) return {date: t.date, amount: (t.total || 0) * tickerFx(t.ticker, ilsToUsd)}
            return {date: t.date, amount: amountNative * tickerFx(t.ticker, ilsToUsd)}
        })
        .filter(Boolean)

    if (positions.length) {
        const quotes = await getQuotes(positions.map((p) => p.ticker))
        const quoteMap = Object.fromEntries(quotes.filter(Boolean).map((q) => [q.ticker, q]))
        cashFlows.push({
            date: new Date(),
            amount: positions.reduce((sum, p) => sum + (quoteMap[p.ticker]?.price || 0) * p.shares * tickerFx(p.ticker, ilsToUsd), 0),
        })
    }

    const irr = computeXirr(cashFlows)
    return {
        range,
        irr: irr != null ? round(irr * 100) : null,
        twr: round(computeTwr(dailySeries)),
        cashFlowCount: cashFlows.length,
        historyPointCount: dailySeries.length,
    }
}

const TOOL_HANDLERS = {
    get_price_return: toolGetPriceReturn,
    get_transactions: toolGetTransactions,
    get_realized_gains: toolGetRealizedGains,
    get_dividend_summary: toolGetDividendSummary,
    get_portfolio_summary: toolGetPortfolioSummary,
    get_risk_exposure: toolGetRiskExposure,
    get_return_metrics: toolGetReturnMetrics,
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
                'get_dividend_summary for questions about trade history, gains, or dividends received, ' +
                'get_portfolio_summary for current value/P&L/concentration, get_risk_exposure for sector/beta ' +
                'questions, and get_return_metrics for IRR/TWR/performance questions. The static ' +
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
        // the user out. Real cause is logged server-side since the client never sees it.
        console.error('[ai-ask] upstream OpenAI failure:', cause.status, cause.message)
        const err = new Error('AI Q&A upstream request failed - ' + cause.message)
        err.status = 502
        await AiChatMessage.create({user: userId, role: 'error', text: err.message})
        throw err
    }

    const answer = completion.choices[0]?.message?.content?.trim() || ''
    if (!answer) {
        const err = new Error('AI Q&A returned an empty response')
        err.status = 502
        await AiChatMessage.create({user: userId, role: 'error', text: err.message})
        throw err
    }

    await consumeQuestionQuota(userId)

    const usage = {promptTokens: totalPromptTokens || null, completionTokens: totalCompletionTokens || null}
    await AiChatMessage.create({user: userId, role: 'assistant', text: answer, usage})

    return {answer, usage}
}

async function getDailySummary(userId, {force = false, lang = 'en'} = {}) {
    const user = await User.findById(userId)
    if (!user) {
        const err = new Error('User not found')
        err.status = 404
        throw err
    }

    const resolvedLang = lang === 'ru' ? 'ru' : 'en'
    const today = dayKey()
    const cacheKey = `${today}:${resolvedLang}`
    const cached = user.aiDailySummary
    if (!force && cached?.dayKey === cacheKey && cached.text) {
        return {summary: cached.text, generatedAt: cached.generatedAt, cached: true}
    }

    const openai = getClient()
    if (!openai) {
        const err = new Error('AI Q&A is not configured')
        err.status = 503
        throw err
    }

    const {contextText, tickers} = await buildPortfolioContext(userId)
    const [newsText, marketsText] = await Promise.all([buildNewsContext(tickers), buildMarketsContext()])

    const languageInstruction = resolvedLang === 'ru'
        ? ' Write the summary in Russian.'
        : ' Write the summary in English.'

    const messages = [
        {
            role: 'system',
            content: 'You are a portfolio analysis assistant inside a personal stock tracking app. ' +
                'Write a short daily summary (4-6 sentences) covering: how the user\'s holdings did today, ' +
                'anything notable on their watchlist today, and how the main markets performed today. ' +
                'Use the context provided. Be concise and specific with numbers. You are not a licensed ' +
                'financial advisor — do not give personalized investment recommendations, describe what the data shows.' +
                languageInstruction,
        },
        {role: 'user', content: contextText + newsText + marketsText},
    ]

    let completion
    try {
        completion = await openai.chat.completions.create({
            model: MODEL,
            messages,
            max_tokens: 300,
        })
    } catch (cause) {
        console.error('[ai-daily-summary] upstream OpenAI failure:', cause.status, cause.message)
        const err = new Error('AI daily summary upstream request failed - ' + cause.message)
        err.status = 502
        throw err
    }

    const answer = completion.choices[0]?.message?.content?.trim() || ''
    if (!answer) {
        const err = new Error('AI daily summary returned an empty response')
        err.status = 502
        throw err
    }

    const generatedAt = new Date()
    user.aiDailySummary = {dayKey: cacheKey, text: answer, generatedAt}
    await user.save()

    return {summary: answer, generatedAt, cached: false}
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

module.exports = {askAboutPortfolio, getChatHistory, clearChatHistory, getDailySummary, dayKey}
