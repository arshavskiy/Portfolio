const fs = require('node:fs/promises')
const path = require('node:path')
const {inferActivity, inferRelevance, scoreCommunity} = require('./scoring')
const {slugify, upsertCommunities} = require('./communityStore')

const QUERIES_FILE = path.join(__dirname, '..', 'data', 'discoveryQueries.json')
const RUNS_DIR = path.join(__dirname, '..', 'data', 'discovery-runs')
const SEARCH_ENDPOINT = 'https://html.duckduckgo.com/html/'
const USER_AGENT = 'StockFolioMarketingAgent/1.0 (+manual-review-local-tool)'
const MIN_CONFIDENCE = 35
const INVESTING_SIGNAL_RE = /(invest|stock|portfolio|trading|market|crypto|bitcoin|etf|инвест|инвести|акци|портфел|трейдинг|рынок|крипт|биткоин|ETF)/i
const COMMUNITY_SIGNAL_RE = /(group|community|subreddit|forum|server|channel|сообщество|форум|группа|чат|канал)/i

async function runDiscovery({limitPerQuery = 8} = {}) {
    const startedAt = new Date().toISOString()
    const queries = JSON.parse(await fs.readFile(QUERIES_FILE, 'utf8'))
    const candidates = []
    const rejected = []
    const errors = []
    
    for (const query of queries) {
        try {
            const results = await search(query.query, limitPerQuery)
            for (const result of results) {
                const {candidate, rejection} = buildCandidate(result, query)
                if (candidate) {
                    candidates.push(candidate)
                } else if (rejection) {
                    rejected.push(rejection)
                }
            }
        } catch (error) {
            errors.push({
                query: query.label,
                message: error.message,
            })
        }
    }
    
    const {communities, added, updated} = await upsertCommunities(candidates)
    const finishedAt = new Date().toISOString()
    const runLog = await writeDiscoveryRun({
        startedAt,
        finishedAt,
        added,
        updated,
        scanned: candidates.length,
        rejected: rejected.length,
        total: communities.length,
        errors,
        rejections: summarizeRejections(rejected),
        candidates: candidates.map((candidate) => ({
            id: candidate.id,
            canonicalId: candidate.canonicalId,
            platform: candidate.platform,
            name: candidate.name,
            url: candidate.url,
            confidence: candidate.confidence,
            outreachStrategy: candidate.outreachStrategy,
            sourceQuery: candidate.sourceQuery,
        })),
        rejectedResults: rejected,
    })
    
    return {
        added,
        updated,
        scanned: candidates.length,
        rejected: rejected.length,
        total: communities.length,
        errors,
        rejections: summarizeRejections(rejected),
        runLog,
        communities,
    }
}

async function search(query, limit) {
    const body = new URLSearchParams({q: query})
    const response = await fetch(SEARCH_ENDPOINT, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': USER_AGENT,
        },
        body,
    })
    
    if (!response.ok) {
        throw new Error(`Search returned ${response.status}`)
    }
    
    const html = await response.text()
    return parseDuckDuckGoResults(html).slice(0, limit)
}

function parseDuckDuckGoResults(html) {
    const results = []
    const blocks = html.split(/<div class="result results_links/i).slice(1)
    
    for (const block of blocks) {
        const linkMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
        if (!linkMatch) continue
        
        const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
        const url = decodeResultUrl(decodeHtml(linkMatch[1]))
        const title = cleanText(linkMatch[2])
        const snippet = snippetMatch ? cleanText(snippetMatch[1]) : ''
        
        if (!url || !title) continue
        results.push({title, url, snippet})
    }
    
    return results
}

function resultToCommunity(result, query) {
    return buildCandidate(result, query).candidate
}

function buildCandidate(result, query) {
    const platform = inferPlatform(result.url, query.platform)
    const name = normalizeName(result.title, platform)
    const rejectionReason = lowSignalReason(result.url, name)
    
    if (!name || rejectionReason) {
        return {
            candidate: null,
            rejection: rejectedResult(result, query, rejectionReason || 'missing-name'),
        }
    }
    
    const text = `${result.title} ${result.snippet}`
    const members = inferMembers(text)
    const posting = inferPosting(platform, text)
    const base = {
        id: `${platform}-${slugify(name)}`,
        canonicalId: inferCanonicalId(result.url, platform, name),
        platform,
        name,
        language: query.language || inferLanguage(`${result.title} ${result.snippet}`),
        members,
        posting,
        url: result.url,
        notes: result.snippet || `Discovered from public search query: ${query.label}. Review community rules before posting.`,
        source: 'discovery',
        sourceQuery: query.label,
        discoveredAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        status: 'new',
        review: 'pending',
    }
    
    base.relevance = inferRelevance(base)
    base.activity = inferActivity(base)
    base.confidence = inferConfidence(base, result, query)
    base.outreachStrategy = inferOutreachStrategy(base, text)
    base.score = scoreCommunity(base)
    
    if (base.confidence < MIN_CONFIDENCE) {
        return {
            candidate: null,
            rejection: rejectedResult(result, query, 'low-confidence', {confidence: base.confidence}),
        }
    }
    
    return {candidate: base, rejection: null}
}

function inferPlatform(url, fallback) {
    const host = safeHost(url)
    if (host.includes('facebook.com')) return 'facebook'
    if (host.includes('reddit.com')) return 'reddit'
    if (host.includes('t.me') || host.includes('telegram')) return 'telegram'
    if (host.includes('discord') || host.includes('disboard')) return 'discord'
    if (host.includes('x.com') || host.includes('twitter.com')) return 'x'
    return fallback || 'forum'
}

function inferPosting(platform, text = '') {
    const lowered = text.toLowerCase()
    if (/(no self[-\s]?promotion|no promotion|no advertising|spam not allowed|no spam)/i.test(lowered)) {
        return 'Restricted'
    }
    if (/(weekly thread|self[-\s]?promo thread|feedback thread|show and tell|tool Tuesday)/i.test(lowered)) {
        return 'Limited thread'
    }
    if (platform === 'reddit') return 'Restricted'
    if (platform === 'telegram' || platform === 'discord') return 'Ask admins'
    if (platform === 'x') return 'Usually allowed'
    return 'Check rules'
}

function inferOutreachStrategy(community, text = '') {
    const lowered = `${text} ${community.notes || ''}`.toLowerCase()
    if (/(no self[-\s]?promotion|no promotion|no advertising|spam not allowed|no spam)/i.test(lowered)) {
        return 'do-not-post'
    }
    if (/(weekly thread|self[-\s]?promo thread|feedback thread|show and tell|tool Tuesday)/i.test(lowered)) {
        return 'feedback-thread'
    }
    if (community.posting === 'Ask admins') return 'ask-admins'
    if (community.posting === 'Restricted') return 'ask-mods'
    if (community.platform === 'x') return 'reply-only'
    if (community.posting === 'Usually allowed') return 'direct-post-ok'
    return 'review-rules'
}

function inferConfidence(community, result, query) {
    const text = `${result.title} ${result.snippet} ${result.url}`.toLowerCase()
    let score = 30
    
    if (community.platform === query.platform) score += 12
    if (safeHost(result.url)) score += 8
    if (community.canonicalId) score += 10
    if (community.members > 0) score += 8
    if (result.snippet) score += 8
    if (INVESTING_SIGNAL_RE.test(text)) score += 18
    if (COMMUNITY_SIGNAL_RE.test(text)) score += 8
    if (/(login|privacy|share|policy)/i.test(text)) score -= 20
    
    return Math.max(0, Math.min(100, score))
}

function inferLanguage(text) {
    if (/[\u0590-\u05ff]/.test(text)) return 'he'
    if (/[\u0400-\u04ff]/.test(text)) return 'ru'
    return 'en'
}

function inferMembers(text) {
    const match = text.match(/([\d,.]+)\s*(k|m|thousand|million|тыс|млн)?\s*(members|subscribers|users|участник(?:ов|и)?|подписчик(?:ов|и)?|пользовател(?:ей|и))/i)
    if (!match) return 0
    
    const base = Number(match[1].replace(/,/g, ''))
    if (!Number.isFinite(base)) return 0
    
    const unit = (match[2] || '').toLowerCase()
    if (unit === 'm' || unit === 'million' || unit === 'млн') return Math.round(base * 1000000)
    if (unit === 'k' || unit === 'thousand' || unit === 'тыс') return Math.round(base * 1000)
    return Math.round(base)
}

function normalizeName(title, platform) {
    return decodeHtml(title)
            .replace(/\s*-\s*(Facebook|Reddit|Telegram|Discord|X|Twitter).*$/i, '')
            .replace(/\s*\|\s*.*$/i, '')
            .replace(/^\/r\//i, 'r/')
            .replace(/^Reddit\s+-\s+/i, '')
            .replace(/^Facebook\s+-\s+/i, '')
            .trim()
        || `${platform} community`
}

function lowSignalReason(url, name) {
    const lowered = `${url} ${name}`.toLowerCase()
    if (!url) return 'missing-url'
    if (!name || name.length < 3) return 'weak-name'
    if (lowered.includes('/login')) return 'login-page'
    if (lowered.includes('/share')) return 'share-page'
    if (lowered.includes('privacy')) return 'privacy-page'
    if (lowered.includes('yandex.ru/search')) return 'search-page'
    return ''
}

function inferCanonicalId(url, platform, name) {
    const host = safeHost(url)
    const pathname = safePathname(url)
    
    if (platform === 'reddit') {
        const match = pathname.match(/\/r\/([^/]+)/i)
        if (match) return `reddit:r/${match[1].toLowerCase()}`
    }
    
    if (platform === 'telegram') {
        const match = pathname.match(/^\/([^/]+)/)
        if (host === 't.me' && match) return `telegram:${match[1].toLowerCase()}`
    }
    
    if (platform === 'facebook') {
        const groupMatch = pathname.match(/\/groups\/([^/?]+)/i)
        if (groupMatch) return `facebook:group:${groupMatch[1].toLowerCase()}`
    }
    
    if (platform === 'x') {
        const match = pathname.match(/^\/([^/]+)/)
        if (match && !['search', 'hashtag', 'i'].includes(match[1].toLowerCase())) {
            return `x:${match[1].toLowerCase()}`
        }
    }
    
    if (platform === 'discord') return `discord:${slugify(name)}`
    return `${platform}:${slugify(name)}`
}

function rejectedResult(result, query, reason, extra = {}) {
    return {
        query: query.label,
        reason,
        title: result.title || '',
        url: result.url || '',
        ...extra,
    }
}

function summarizeRejections(rejected) {
    return rejected.reduce((summary, item) => {
        summary[item.reason] = (summary[item.reason] || 0) + 1
        return summary
    }, {})
}

async function writeDiscoveryRun(run) {
    await fs.mkdir(RUNS_DIR, {recursive: true})
    const fileName = `${run.finishedAt.replace(/[:.]/g, '-')}.json`
    const filePath = path.join(RUNS_DIR, fileName)
    await fs.writeFile(filePath, `${JSON.stringify(run, null, 2)}\n`, 'utf8')
    return path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/')
}

function decodeResultUrl(url) {
    try {
        const parsed = new URL(url, SEARCH_ENDPOINT)
        const redirect = parsed.searchParams.get('uddg')
        return redirect ? decodeURIComponent(redirect) : parsed.href
    } catch {
        return url
    }
}

function safeHost(url) {
    try {
        return new URL(url).hostname.toLowerCase()
    } catch {
        return ''
    }
}

function safePathname(url) {
    try {
        return new URL(url).pathname
    } catch {
        return ''
    }
}

function cleanText(html) {
    return decodeHtml(html.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
}

function decodeHtml(value) {
    return String(value)
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
}

module.exports = {
    runDiscovery,
    parseDuckDuckGoResults,
    resultToCommunity,
    buildCandidate,
    inferOutreachStrategy,
    inferConfidence,
    inferCanonicalId,
}
