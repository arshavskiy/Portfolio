const OpenAI = require('openai')
const Position = require('../models/Position')
const Watchlist = require('../models/Watchlist')
const AiChatMessage = require('../models/AiChatMessage')
const {getQuotes, getMarketNews} = require('./stockService')

const HISTORY_LIMIT = 50

const MODEL = 'gpt-4o-mini'
const DAILY_LIMIT = 20
const QUESTION_MAX_LENGTH = 500

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
        `Watchlist (stocks the user is tracking but does NOT own):\n${watchlistText}`
    
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

    let completion
    try {
        completion = await openai.chat.completions.create({
            model: MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are a portfolio analysis assistant inside a personal stock tracking app. ' +
                        'Answer questions about the user\'s holdings AND watchlist using only the context provided ' +
                        '— the context clearly separates stocks the user owns from stocks they are only watching; ' +
                        'keep that distinction clear in your answer. Be concise (3-5 sentences). You are not a ' +
                        'licensed financial advisor — do not give personalized investment recommendations; ' +
                        'describe what the data shows instead.',
                },
                {role: 'system', content: contextText + newsText},
                {role: 'user', content: trimmed},
            ],
            max_tokens: 400,
        })
    } catch (cause) {
        // Re-thrown with a 502 regardless of the upstream status — a raw 401/403
        // from OpenAI must never reach the client as-is, since useApi.js treats
        // any 401 response from *this* API as "your session expired" and logs
        // the user out.
        const err = new Error('AI Q&A upstream request failed - ' + cause.message);
        err.status = 502
        await AiChatMessage.create({user: userId, role: 'error', text: err.message})
        throw err
    }
    
    const answer = completion.choices[0]?.message?.content?.trim() || ''
    const usage = {
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
    }
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
