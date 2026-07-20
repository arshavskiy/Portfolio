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
    PriceStat,
    TickerTypology,
} = require('../models/insightsModels')

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes — matches the upstream service's own TTL
const cache = new Map()

async function getEnrichment(ticker) {
    const key = ticker.toUpperCase()
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.body
    
    const since7d = new Date(Date.now() - 7 * 86_400_000)
    
    const [series, articles, nextEvent, recentEvents, ownership, surprises, recTrends, shortInt, nextMacro, priceStats, typo] = await Promise.all([
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
    ])
    
    const latestPrice = priceStats[0] ?? null
    
    const beats = surprises.filter((s) => (s.surprisePct ?? 0) > 0).length
    const bullish = (t) => (t?.strongBuy || 0) + (t?.buy || 0)
    const analystDelta = recTrends.length >= 2 ? bullish(recTrends[0]) - bullish(recTrends[1]) : null
    
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

module.exports = {getEnrichment, getTypologyMap, getRelatedTickers}
