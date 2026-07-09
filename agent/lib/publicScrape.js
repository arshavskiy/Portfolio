const fs = require('node:fs/promises')
const path = require('node:path')
const {readCommunities, writeCommunities} = require('./communityStore')

const REPORTS_DIR = path.join(__dirname, '..', 'data', 'scrape-runs')
const DEFAULT_LIMIT = 60
const DEFAULT_DELAY_MS = 8000
const DEFAULT_TIMEOUT_MS = 20000
const COMMUNITY_SIGNAL_RE = /(community|members|subscribers|forum|server|channel|group|subreddit|сообщество|участник|подписчик|форум|сервер|канал|группа|чат)/i
const INVESTING_SIGNAL_RE = /(invest|stock|stocks|portfolio|trading|market|etf|dividend|инвест|инвести|акци|портфел|трейдинг|рынок|дивиденд)/i
const CRYPTO_SIGNAL_RE = /(crypto|bitcoin|ethereum|defi|blockchain|крипт|биткоин|эфир|блокчейн)/i
const RULE_SIGNAL_RE = /(rules|guidelines|moderator|admin|self promotion|self-promotion|advertising|spam|правил|модератор|админ|реклам|спам)/i
const BLOCKS_PROMOTION_RE = /(no self promotion|no self-promotion|no promotion|no advertising|no spam|spam not allowed|без рекламы|реклама запрещена|самореклама запрещена|запрещена реклама|спам запрещен|спам запрещён)/i
const FEEDBACK_THREAD_RE = /(feedback thread|weekly thread|show and tell|self-promo thread|self promotion thread|tool tuesday|ветка обратной связи|еженедельн(?:ая|ый) ветка|тред обратной связи|ветка для самопиара)/i
const LOGIN_GATED_RE = /(log in|sign up|create account|enable javascript|join to view|войти|зарегистрируй|создать аккаунт|включите javascript|только для участников)/i

function numberFromEnv(name, fallback) {
    const value = Number(process.env[name])
    return Number.isFinite(value) && value > 0 ? value : fallback
}

function timestamp() {
    return new Date().toISOString()
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeHost(url) {
    try {
        return new URL(url).hostname.toLowerCase()
    } catch {
        return ''
    }
}

function shouldSkip(community) {
    const host = safeHost(community.url)
    if (!community.url) return 'missing-url'
    if (community.scrapeStatus === 'blocked') return 'previously-blocked'
    if (host.includes('facebook.com')) return 'facebook-public-pages-are-often-login-gated'
    if (host.includes('x.com') || host.includes('twitter.com')) return 'x-public-pages-are-often-login-gated'
    if (community.url.includes('google.com/search')) return 'search-result-url'
    return ''
}

function inferSignals(text) {
    const lowered = text.toLowerCase()
    return {
        hasCommunitySignal: COMMUNITY_SIGNAL_RE.test(text),
        hasInvestingSignal: INVESTING_SIGNAL_RE.test(text),
        hasCryptoSignal: CRYPTO_SIGNAL_RE.test(text),
        hasRuleSignal: RULE_SIGNAL_RE.test(text),
        blocksPromotion: BLOCKS_PROMOTION_RE.test(text),
        hasFeedbackThread: FEEDBACK_THREAD_RE.test(text),
        looksLoginGated: LOGIN_GATED_RE.test(lowered),
    }
}

function confidenceDelta(signals) {
    let delta = 0
    if (signals.hasCommunitySignal) delta += 6
    if (signals.hasInvestingSignal) delta += 8
    if (signals.hasCryptoSignal) delta += 5
    if (signals.hasRuleSignal) delta += 4
    if (signals.hasFeedbackThread) delta += 6
    if (signals.blocksPromotion) delta -= 12
    if (signals.looksLoginGated) delta -= 18
    return delta
}

function strategyFromSignals(current, signals) {
    if (signals.blocksPromotion) return 'do-not-post'
    if (signals.hasFeedbackThread) return 'feedback-thread'
    if (signals.hasRuleSignal && (!current || current === 'review-rules')) return 'review-rules'
    return current || 'review-rules'
}

async function scrapeCommunity(page, community, timeoutMs) {
    await page.goto(community.url, {waitUntil: 'domcontentloaded', timeout: timeoutMs})
    await page.waitForTimeout(900)
    
    return page.evaluate(() => {
        const meta = (name) =>
            document.querySelector(`meta[name="${name}"]`)?.content ||
            document.querySelector(`meta[property="${name}"]`)?.content ||
            ''
        const bodyText = document.body?.innerText || ''
        return {
            title: document.title || '',
            description: meta('description') || meta('og:description'),
            h1: [...document.querySelectorAll('h1')].slice(0, 3).map((node) => node.innerText.trim()).filter(Boolean),
            sampleText: bodyText.replace(/\s+/g, ' ').trim().slice(0, 2000),
        }
    })
}

async function writeReport(report) {
    await fs.mkdir(REPORTS_DIR, {recursive: true})
    const reportPath = path.join(REPORTS_DIR, `${report.finishedAt.replace(/[:.]/g, '-')}.json`)
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    await fs.writeFile(path.join(REPORTS_DIR, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    return reportPath
}

function resolveConfig(config = {}) {
    return {
        limit: Number.isFinite(config.limit) && config.limit > 0 ? config.limit : numberFromEnv('SCRAPE_LIMIT', DEFAULT_LIMIT),
        delayMs: Number.isFinite(config.delayMs) && config.delayMs > 0 ? config.delayMs : numberFromEnv('SCRAPE_DELAY_MS', DEFAULT_DELAY_MS),
        timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : numberFromEnv('SCRAPE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    }
}

async function loadPlaywright() {
    try {
        return require('playwright')
    } catch {
        throw new Error('Playwright is not installed for the local agent. Run npm install inside agent/.')
    }
}

async function runPublicScrape(config = {}) {
    const playwright = await loadPlaywright()
    const {limit, delayMs, timeoutMs} = resolveConfig(config)
    const communities = await readCommunities()
    const report = {
        startedAt: timestamp(),
        finishedAt: null,
        config: {limit, delayMs, timeoutMs},
        scraped: [],
        skipped: [],
        failed: [],
        totalBefore: communities.length,
    }
    
    const browser = await playwright.chromium.launch({headless: false})
    const context = await browser.newContext({
        userAgent: 'StockFolioMarketingAgent/1.0 (+manual-review-public-page-check)',
        viewport: {width: 1280, height: 900},
    })
    const page = await context.newPage()
    
    try {
        let count = 0
        for (const community of communities) {
            if (count >= limit) break
            
            const skipReason = shouldSkip(community)
            if (skipReason) {
                report.skipped.push({id: community.id, name: community.name, url: community.url, reason: skipReason})
                continue
            }
            
            count += 1
            
            try {
                const scraped = await scrapeCommunity(page, community, timeoutMs)
                const combinedText = `${scraped.title} ${scraped.description} ${scraped.h1.join(' ')} ${scraped.sampleText}`
                const signals = inferSignals(combinedText)
                const delta = confidenceDelta(signals)
                const nextConfidence = Math.max(0, Math.min(100, (community.confidence || 45) + delta))
                const looksUseful = signals.hasCommunitySignal || signals.hasInvestingSignal || signals.hasCryptoSignal
                
                Object.assign(community, {
                    confidence: nextConfidence,
                    outreachStrategy: strategyFromSignals(community.outreachStrategy, signals),
                    scrapeStatus: signals.looksLoginGated ? 'login-gated' : (looksUseful ? 'verified' : 'low-signal'),
                    scrapeSignals: signals,
                    scrapedTitle: scraped.title,
                    scrapedDescription: scraped.description,
                    scrapedAt: timestamp(),
                })
                
                report.scraped.push({
                    id: community.id,
                    name: community.name,
                    url: community.url,
                    status: community.scrapeStatus,
                    confidence: community.confidence,
                    outreachStrategy: community.outreachStrategy,
                    signals,
                })
            } catch (error) {
                community.scrapeStatus = 'failed'
                community.scrapeError = error.message
                community.scrapedAt = timestamp()
                report.failed.push({id: community.id, name: community.name, url: community.url, error: error.message})
            }
            
            await sleep(delayMs)
        }
    } finally {
        await browser.close()
    }
    
    await writeCommunities(communities)
    report.finishedAt = timestamp()
    const reportPath = await writeReport(report)
    
    return {
        communities,
        report,
        runLog: path.relative(path.join(__dirname, '..'), reportPath).replace(/\\/g, '/'),
        scraped: report.scraped.length,
        skipped: report.skipped.length,
        failed: report.failed.length,
    }
}

module.exports = {
    runPublicScrape,
}
