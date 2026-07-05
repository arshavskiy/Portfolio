const fs = require('node:fs/promises')
const path = require('node:path')
const {inferActivity, inferRelevance, scoreCommunity} = require('./scoring')
const {slugify, upsertCommunities} = require('./communityStore')

const QUERIES_FILE = path.join(__dirname, '..', 'data', 'discoveryQueries.json')
const SEARCH_ENDPOINT = 'https://html.duckduckgo.com/html/'
const USER_AGENT = 'StockFolioMarketingAgent/1.0 (+manual-review-local-tool)'

async function runDiscovery({limitPerQuery = 8} = {}) {
  const queries = JSON.parse(await fs.readFile(QUERIES_FILE, 'utf8'))
  const candidates = []
  const errors = []

  for (const query of queries) {
    try {
      const results = await search(query.query, limitPerQuery)
      for (const result of results) {
        const candidate = resultToCommunity(result, query)
        if (candidate) candidates.push(candidate)
      }
    } catch (error) {
      errors.push({
        query: query.label,
        message: error.message,
      })
    }
  }

  const {communities, added, updated} = await upsertCommunities(candidates)

  return {
    added,
    updated,
    scanned: candidates.length,
    total: communities.length,
    errors,
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
  const platform = inferPlatform(result.url, query.platform)
  const name = normalizeName(result.title, platform)
  if (!name || isLowSignal(result.url, name)) return null

  const members = inferMembers(`${result.title} ${result.snippet}`)
  const base = {
    id: `${platform}-${slugify(name)}`,
    platform,
    name,
    language: query.language || inferLanguage(`${result.title} ${result.snippet}`),
    members,
    posting: inferPosting(platform),
    url: result.url,
    notes: result.snippet || `Discovered from public search query: ${query.label}. Review community rules before posting.`,
    source: 'discovery',
    sourceQuery: query.label,
    discoveredAt: new Date().toISOString(),
  }

  base.relevance = inferRelevance(base)
  base.activity = inferActivity(base)
  base.score = scoreCommunity(base)
  return base
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

function inferPosting(platform) {
  if (platform === 'reddit') return 'Restricted'
  if (platform === 'telegram' || platform === 'discord') return 'Ask admins'
  if (platform === 'x') return 'Usually allowed'
  return 'Check rules'
}

function inferLanguage(text) {
  return /[\u0590-\u05ff]/.test(text) ? 'he' : 'en'
}

function inferMembers(text) {
  const match = text.match(/([\d,.]+)\s*(k|m|thousand|million)?\s*(members|subscribers|users)/i)
  if (!match) return 0

  const base = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(base)) return 0

  const unit = (match[2] || '').toLowerCase()
  if (unit === 'm' || unit === 'million') return Math.round(base * 1000000)
  if (unit === 'k' || unit === 'thousand') return Math.round(base * 1000)
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

function isLowSignal(url, name) {
  const lowered = `${url} ${name}`.toLowerCase()
  return lowered.includes('/login') || lowered.includes('/share') || lowered.includes('privacy') || name.length < 3
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
}
