// Reads the stockfolio-insights microservice's data directly from its
// MongoDB collections (same Atlas cluster, sibling DB) — no HTTP call to
// that service. It stays the sole writer; this is a read-only composition
// mirroring its own /enrich/:ticker route. See models/insightsModels.js
// and the stockfolio-insights repo's CLAUDE.md for the source schemas.
const {
    TickerInsight,
    Article,
    CorporateEvent,
    OwnershipSnapshot,
    AnalystTrend,
    ShortInterest,
    MacroEvent,
    MacroDataPoint,
    PriceStat,
    TickerTypology,
    FinancialFact,
} = require('../models/insightsModels')

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes — matches the upstream service's own TTL
const cache = new Map()

async function getEnrichment(ticker) {
    const key = ticker.toUpperCase()
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.body
    
    const since7d = new Date(Date.now() - 7 * 86_400_000)
    
    const [series, articles, nextEvent, recentEvents, ownership, surprises, recTrends, shortInt, nextMacro, priceStats, typo, financials] = await Promise.all([
        TickerInsight.find({ticker: key}).sort({date: 1}).limit(14).lean(),
        Article.find({tickers: key, analyzed: true, publishedAt: {$gte: since7d}})
            .sort({publishedAt: -1})
            .limit(5)
            .select('headline url publishedAt sentiment themes llmSummary')
            .lean(),
        CorporateEvent.findOne({ticker: key, date: {$gte: new Date()}}).sort({date: 1}).lean(),
        CorporateEvent.find({ticker: key, date: {$lt: new Date()}}).sort({date: -1}).limit(3).lean(),
        OwnershipSnapshot.findOne({ticker: key}).sort({asOf: -1}).lean(),
        CorporateEvent.find({ticker: key, type: 'earnings', epsActual: {$ne: null}, surprisePct: {$exists: true}})
            .sort({date: -1}).limit(8).select('date period epsActual epsEstimate surprisePct').lean(),
        AnalystTrend.find({ticker: key}).sort({period: -1}).limit(3).lean(),
        ShortInterest.findOne({ticker: key}).sort({settlementDate: -1}).lean(),
        MacroEvent.findOne({date: {$gte: new Date()}, impact: 'high'}).sort({date: 1}).lean(),
        PriceStat.find({ticker: key}).sort({date: -1}).limit(30).lean(),
        TickerTypology.findOne({ticker: key}).select('tags primaryIndustry marketCapClass style volatilityClass').lean(),
        FinancialFact.find({ticker: key}).lean(),
    ])
    
    const latestPrice = priceStats[0] ?? null

    const beats = surprises.filter((s) => (s.surprisePct ?? 0) > 0).length
    const bullish = (t) => (t?.strongBuy || 0) + (t?.buy || 0)
    const analystDelta = recTrends.length >= 2 ? bullish(recTrends[0]) - bullish(recTrends[1]) : null

    // FinancialFact stores only the latest annual + latest quarterly doc per
    // concept (see xbrlFacts.js upstream, no historical series) — reshape
    // into {concept: {annual, quarterly}}. No YoY/growth figures are derived
    // here since there's no prior-period fact to diff against yet.
    const fundamentals = {}
    for (const f of financials) {
        if (!fundamentals[f.concept]) fundamentals[f.concept] = {annual: null, quarterly: null}
        fundamentals[f.concept][f.fiscalPeriodType] = {period: f.period, value: f.value, unit: f.unit, filed: f.filed}
    }

    const latest = series.at(-1)
    const body = {
        ticker: key,
        generatedAt: new Date().toISOString(),
        summary: {
            sentiment: latest?.avgSentiment ?? null,
            momentum: latest?.momentum ?? null,
            articleCount7d: series.slice(-7).reduce((s, r) => s + r.articleCount, 0),
            topThemes: latest?.topThemes ?? [],
            daysToNextEvent: nextEvent
                ? Math.ceil((new Date(nextEvent.date).getTime() - Date.now()) / 86_400_000)
                : null,
            insiderNet3m: ownership?.insiderNet3m ?? null,
            beatRate: surprises.length ? {beats, of: surprises.length} : null,
            analystDelta,
            daysToCover: shortInt?.daysToCover ?? null,
            shortInterestChangePct: shortInt?.changePct ?? null,
            volumeRatio: latestPrice?.volumeRatio ?? null,
            unusualVolume: latestPrice?.unusualVolume ?? false,
            lastChangePct: latestPrice?.changePct ?? null,
            nextMacro: nextMacro
                ? {label: nextMacro.label, date: nextMacro.date, note: nextMacro.note ?? null}
                : null,
        },
        typology: typo ?? null,
        fundamentals,
        priceSeries: priceStats.slice().reverse().map((p) => ({
            date: p.date, close: p.close, volume: p.volume, volumeRatio: p.volumeRatio,
        })),
        surpriseHistory: surprises,
        analystTrends: recTrends,
        shortInterest: shortInt,
        sentimentSeries: series.map((r) => ({
            date: r.date,
            sentiment: r.avgSentiment,
            articles: r.articleCount,
        })),
        headlines: articles,
        nextEvent,
        recentEvents,
        ownership,
    }
    
    cache.set(key, {at: Date.now(), body})
    return body
}

// Macro readings are global (not per-ticker) and update at most monthly
// upstream (FRED cadence) — one cached snapshot serves every caller.
const MACRO_CACHE_TTL = 60 * 60 * 1000 // 1 hour
let macroCache = null

async function getMacroSnapshot() {
    if (macroCache && Date.now() - macroCache.at < MACRO_CACHE_TTL) return macroCache.body

    const rows = await MacroDataPoint.find({}).sort({date: -1}).lean()
    const latestBySeries = new Map()
    for (const r of rows) {
        if (!latestBySeries.has(r.series)) latestBySeries.set(r.series, r)
    }

    const body = {
        generatedAt: new Date().toISOString(),
        series: Object.fromEntries(
            [...latestBySeries.entries()].map(([series, r]) => [series, {date: r.date, value: r.value, unit: r.unit}])
        ),
    }

    macroCache = {at: Date.now(), body}
    return body
}

const MAP_GROUPS = new Set(['style', 'marketCapClass', 'volatilityClass', 'primaryIndustry'])
const mapCache = new Map()
const MAP_CACHE_TTL = 10 * 60 * 1000 // typology recomputes once/day upstream — cache generously

async function getTypologyMap(groupBy = 'style') {
    const group = MAP_GROUPS.has(groupBy) ? groupBy : 'style'
    const hit = mapCache.get(group)
    if (hit && Date.now() - hit.at < MAP_CACHE_TTL) return hit.body
    
    const rows = await TickerTypology.find({})
        .select('ticker style marketCapClass volatilityClass primaryIndustry newsProfile insiderSignal tags inputs')
        .lean()
    
    const groups = new Map()
    for (const r of rows) {
        const key = r[group] || 'unknown'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push({
            ticker: r.ticker,
            style: r.style,
            marketCapClass: r.marketCapClass,
            newsProfile: r.newsProfile,
            insiderSignal: r.insiderSignal,
            tags: r.tags,
            marketCap: r.inputs?.marketCap ?? null,
        })
    }
    
    const body = {
        groupBy: group,
        groups: [...groups.entries()]
            .map(([key, tickers]) => ({key, count: tickers.length, tickers}))
            .sort((a, b) => b.count - a.count),
    }
    
    mapCache.set(group, {at: Date.now(), body})
    return body
}

// Tickers that co-occur with `ticker` in the same analyzed article, i.e. the
// LLM tagged both in one story (competitor/supply-chain/sector-move signal).
// Weight = number of shared articles in the last `days`.
async function getRelatedTickers(ticker, days = 30, limit = 12) {
    const key = ticker.toUpperCase()
    const since = new Date(Date.now() - days * 86_400_000)
    
    const rows = await Article.aggregate([
        {$match: {tickers: key, analyzed: true, publishedAt: {$gte: since}}},
        {$unwind: '$tickers'},
        {$match: {tickers: {$ne: key}}},
        {
            $group: {
                _id: '$tickers',
                weight: {$sum: 1},
                latestHeadline: {$last: '$headline'},
                latestSentiment: {$last: '$sentiment'},
                latestUrl: {$last: '$url'},
            },
        },
        {$sort: {weight: -1}},
        {$limit: limit},
    ])
    
    const relatedTickers = rows.map((r) => r._id)
    const typologies = relatedTickers.length
        ? await TickerTypology.find({ticker: {$in: relatedTickers}})
            .select('ticker style marketCapClass')
            .lean()
        : []
    const typoByTicker = new Map(typologies.map((t) => [t.ticker, t]))
    
    return {
        ticker: key,
        days,
        related: rows.map((r) => ({
            ticker: r._id,
            weight: r.weight,
            latestHeadline: r.latestHeadline,
            latestSentiment: r.latestSentiment,
            latestUrl: r.latestUrl,
            style: typoByTicker.get(r._id)?.style ?? null,
            marketCapClass: typoByTicker.get(r._id)?.marketCapClass ?? null,
        })),
    }
}

// Bulk, lightweight lookup for the Watchlist grid — insider net-buy/sell only,
// no full /enrich payload per row. 5-min TTL matches getEnrichment (upstream
// worker:calendar recomputes OwnershipSnapshot once/day, so this is generous).
const insiderCache = new Map()

async function getInsiderSnapshots(tickers) {
    const keys = [...new Set((tickers || []).map((t) => String(t).toUpperCase()))]
    const now = Date.now()
    const result = {}
    const missing = []

    for (const key of keys) {
        const hit = insiderCache.get(key)
        if (hit && now - hit.at < CACHE_TTL) result[key] = hit.body
        else missing.push(key)
    }
    if (!missing.length) return result

    const rows = await OwnershipSnapshot.aggregate([
        {$match: {ticker: {$in: missing}}},
        {$sort: {asOf: -1}},
        {$group: {_id: '$ticker', insiderNet3m: {$first: '$insiderNet3m'}, insiderTxCount3m: {$first: '$insiderTxCount3m'}}},
    ])

    const byTicker = new Map(rows.map((r) => [r._id, r]))
    for (const key of missing) {
        const row = byTicker.get(key)
        const insiderNet3m = row?.insiderNet3m ?? null
        const body = {
            insiderNet3m,
            insiderTxCount3m: row?.insiderTxCount3m ?? null,
            insiderSignal: insiderNet3m == null ? null : insiderNet3m > 0 ? 'buying' : insiderNet3m < 0 ? 'selling' : 'neutral',
        }
        insiderCache.set(key, {at: now, body})
        result[key] = body
    }
    return result
}

// Bulk, lightweight lookup for the Watchlist grid — net margin % only
// (NetIncomeLoss / Revenues, latest annual FinancialFact), normalized so it's
// comparable across any company size, same spirit as insiderValuePctOf()
// sizing insider shares against market cap on the client. Same cache/shape
// convention as getInsiderSnapshots above.
const fundamentalsCache = new Map()

async function getFundamentalsSnapshots(tickers) {
    const keys = [...new Set((tickers || []).map((t) => String(t).toUpperCase()))]
    const now = Date.now()
    const result = {}
    const missing = []

    for (const key of keys) {
        const hit = fundamentalsCache.get(key)
        if (hit && now - hit.at < CACHE_TTL) result[key] = hit.body
        else missing.push(key)
    }
    if (!missing.length) return result

    const rows = await FinancialFact.find({
        ticker: {$in: missing},
        concept: {$in: ['Revenues', 'NetIncomeLoss']},
        fiscalPeriodType: 'annual',
    }).lean()

    const byTicker = new Map()
    for (const r of rows) {
        if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, {})
        byTicker.get(r.ticker)[r.concept] = r
    }

    for (const key of missing) {
        const facts = byTicker.get(key)
        const revenue = facts?.Revenues?.value
        const netIncome = facts?.NetIncomeLoss?.value
        const netMarginPct = revenue ? (netIncome / revenue) * 100 : null
        const body = {
            netMarginPct,
            period: facts?.Revenues?.period ?? null,
        }
        fundamentalsCache.set(key, {at: now, body})
        result[key] = body
    }
    return result
}

// Paginated ticker news for the Position page's news list — same Article
// source as getEnrichment's inline `headlines` (5, 7d window), but with a
// wider lookback and real pagination for "load more". Not cached: paging
// through offsets against a cache would need per-page cache entries for
// little benefit — this collection only gets appended to (immutable once
// analyzed), so a plain query is cheap and always fresh.
async function getTickerNews(ticker, {page = 1, limit = 10, days = 90} = {}) {
    const key = ticker.toUpperCase()
    const pageNum = Math.max(1, Math.floor(Number(page) || 1))
    const pageSize = Math.min(50, Math.max(1, Math.floor(Number(limit) || 10)))
    const since = new Date(Date.now() - days * 86_400_000)

    const filter = {tickers: key, analyzed: true, publishedAt: {$gte: since}}
    const [articles, total] = await Promise.all([
        Article.find(filter)
            .sort({publishedAt: -1})
            .skip((pageNum - 1) * pageSize)
            .limit(pageSize)
            .select('headline url publishedAt sentiment themes llmSummary source')
            .lean(),
        Article.countDocuments(filter),
    ])

    return {
        ticker: key,
        page: pageNum,
        articles,
        hasMore: pageNum * pageSize < total,
    }
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function getInsightsDataOverview({ticker, source, limit = 25} = {}) {
    const key = ticker ? String(ticker).trim().toUpperCase() : ''
    // A bare suffix like ".TA" isn't a real ticker — treat it as "match any
    // ticker ending in .TA" so the admin page can browse a whole exchange
    // instead of only supporting exact-symbol lookups.
    const isSuffixQuery = key.startsWith('.')
    const tickerMatch = isSuffixQuery ? new RegExp(`${escapeRegExp(key)}$`) : key
    const sourceKey = source ? String(source).trim() : ''
    const pageSize = Math.min(50, Math.max(5, Math.floor(Number(limit) || 25)))

    const articleFilter = {}
    if (key) articleFilter.tickers = tickerMatch
    if (sourceKey) articleFilter.source = sourceKey

    const insightFilter = key ? {ticker: tickerMatch} : {}

    const [
        articleCount,
        analyzedArticleCount,
        taseArticleCount,
        recentArticles,
        recentInsights,
        sourceRows,
        topTickerRows,
        pendingArticles,
    ] = await Promise.all([
        Article.countDocuments(articleFilter),
        Article.countDocuments({...articleFilter, analyzed: true}),
        Article.countDocuments({...articleFilter, tickers: /\.TA$/}),
        Article.find(articleFilter)
            .sort({publishedAt: -1, createdAt: -1})
            .limit(pageSize)
            .select('source headline url publishedAt analyzed tickers sentiment themes llmSummary')
            .lean(),
        TickerInsight.find(insightFilter)
            .sort({date: -1, articleCount: -1})
            .limit(pageSize)
            .select('ticker date articleCount avgSentiment momentum topThemes industries')
            .lean(),
        Article.aggregate([
            {$match: articleFilter},
            {$group: {_id: '$source', count: {$sum: 1}, analyzed: {$sum: {$cond: ['$analyzed', 1, 0]}}}},
            {$sort: {count: -1}},
            {$limit: 20},
        ]),
        Article.aggregate([
            {$match: {...articleFilter, analyzed: true, tickers: {$ne: []}}},
            {$unwind: '$tickers'},
            // articleFilter.tickers matches the array pre-unwind (any element),
            // which would still group by every OTHER ticker in a multi-ticker
            // article without this — re-apply the same filter per-element so
            // "top tickers" only lists ones matching the query, not co-mentions.
            ...(key ? [{$match: {tickers: tickerMatch}}] : []),
            {$group: {_id: '$tickers', articles: {$sum: 1}, avgSentiment: {$avg: '$sentiment'}}},
            {$sort: {articles: -1}},
            {$limit: 20},
        ]),
        Article.find({...articleFilter, analyzed: {$ne: true}})
            .sort({publishedAt: -1, createdAt: -1})
            .limit(10)
            .select('source headline url publishedAt tickers')
            .lean(),
    ])

    return {
        generatedAt: new Date().toISOString(),
        filters: {ticker: key || null, source: sourceKey || null, limit: pageSize},
        summary: {
            articleCount,
            analyzedArticleCount,
            pendingArticleCount: articleCount - analyzedArticleCount,
            taseArticleCount,
            insightRows: await TickerInsight.countDocuments(insightFilter),
        },
        sources: sourceRows.map((r) => ({source: r._id || 'unknown', count: r.count, analyzed: r.analyzed})),
        topTickers: topTickerRows.map((r) => ({
            ticker: r._id,
            articles: r.articles,
            avgSentiment: r.avgSentiment ?? null,
        })),
        insights: recentInsights,
        articles: recentArticles,
        pendingArticles,
    }
}

module.exports = {
    getEnrichment,
    getTypologyMap,
    getRelatedTickers,
    getInsiderSnapshots,
    getTickerNews,
    getMacroSnapshot,
    getFundamentalsSnapshots,
    getInsightsDataOverview,
}
