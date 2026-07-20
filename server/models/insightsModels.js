// Read-only mirrors of the stockfolio-insights microservice's schemas.
// That service (separate repo) owns writes; this file only reads its
// collections directly from the same Atlas cluster, sibling DB — no HTTP
// call to the insights service required. Schemas kept minimal since we
// never write through these models. Source of truth for field shapes:
// stockfolio-insights/src/models/*.js
const mongoose = require('mongoose')
const {Schema} = mongoose

const INSIGHTS_DB_NAME = process.env.STOCKFOLIO_INSIGHTS_DB_NAME || 'stockfolio-insights'
const insightsConn = mongoose.connection.useDb(INSIGHTS_DB_NAME, {useCache: true})

const TickerInsight = insightsConn.model(
    'TickerInsight',
    new Schema({
        ticker: String,
        date: String,
        articleCount: Number,
        avgSentiment: Number,
        momentum: Number,
        topThemes: [String],
        industries: [String],
    })
)

const Article = insightsConn.model(
    'Article',
    new Schema({
        source: String,
        url: String,
        headline: String,
        summary: String,
        publishedAt: Date,
        analyzed: Boolean,
        tickers: [String],
        industries: [String],
        sentiment: Number,
        themes: [String],
        llmSummary: String,
    })
)

const CorporateEvent = insightsConn.model(
    'CorporateEvent',
    new Schema({
        ticker: String,
        type: String,
        date: Date,
        period: String,
        epsEstimate: Number,
        epsActual: Number,
        revenueEstimate: Number,
        revenueActual: Number,
        hour: String,
        surprisePct: Number,
        amount: Number,
        currency: String,
        payDate: Date,
        recordDate: Date,
        accessionNo: String,
        items: [String],
        itemLabels: [String],
        filingUrl: String,
        source: String,
    })
)

const OwnershipSnapshot = insightsConn.model(
    'OwnershipSnapshot',
    new Schema({
        ticker: String,
        asOf: Date,
        insiderPct: Number,
        institutionalPct: Number,
        retailPctEstimate: Number,
        topHolders: [{name: String, type: String, shares: Number, pct: Number, changePct: Number}],
        insiderNet3m: Number,
        insiderTxCount3m: Number,
        source: String,
    })
)

const AnalystTrend = insightsConn.model(
    'AnalystTrend',
    new Schema({
        ticker: String,
        period: String,
        strongBuy: Number,
        buy: Number,
        hold: Number,
        sell: Number,
        strongSell: Number,
    })
)

const ShortInterest = insightsConn.model(
    'ShortInterest',
    new Schema({
        ticker: String,
        settlementDate: Date,
        shortInterest: Number,
        avgDailyVolume: Number,
        daysToCover: Number,
        changePct: Number,
        source: String,
    })
)

const MacroEvent = insightsConn.model(
    'MacroEvent',
    new Schema({
        type: String,
        date: Date,
        label: String,
        impact: String,
        timeET: String,
        note: String,
        source: String,
    })
)

const PriceStat = insightsConn.model(
    'PriceStat',
    new Schema({
        ticker: String,
        date: String,
        open: Number,
        high: Number,
        low: Number,
        close: Number,
        volume: Number,
        changePct: Number,
        avgVolume30d: Number,
        volumeRatio: Number,
        unusualVolume: Boolean,
    })
)

const TickerTypology = insightsConn.model(
    'TickerTypology',
    new Schema({
        ticker: String,
        marketCapClass: String,
        style: String,
        volatilityClass: String,
        dividendProfile: String,
        newsProfile: String,
        insiderSignal: String,
        squeezeRisk: String,
        primaryIndustry: String,
        industries: [String],
        tags: [String],
        inputs: Schema.Types.Mixed,
        computedAt: Date,
    })
)

module.exports = {
    TickerInsight,
    Article,
    CorporateEvent,
    OwnershipSnapshot,
    AnalystTrend,
    ShortInterest,
    MacroEvent,
    PriceStat,
    TickerTypology,
}
