const fs = require('node:fs/promises')
const path = require('node:path')
const {parseDuckDuckGoResults} = require('./discovery')

const QUERIES_FILE = path.join(__dirname, '..', 'data', 'discoveryQueries.json')
const REPORTS_DIR = path.join(__dirname, '..', 'data', 'search-screenshots')
const SEARCH_ENDPOINT = 'https://html.duckduckgo.com/html/'
const DEFAULT_LIMIT = 8
const DEFAULT_DELAY_MS = 1200
const DEFAULT_TIMEOUT_MS = 20000
const USER_AGENT = 'StockFolioMarketingAgent/1.0 (+manual-review-search-screenshots)'

function numberFromEnv(name, fallback) {
    const value = Number(process.env[name])
    return Number.isFinite(value) && value > 0 ? value : fallback
}

function timestamp() {
    return new Date().toISOString()
}

function slugify(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'search'
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadPlaywright() {
    try {
        return require('playwright')
    } catch {
        throw new Error('Playwright is not installed for the local agent. Run npm install inside agent/.')
    }
}

function resolveConfig(config = {}) {
    return {
        limit: Number.isFinite(config.limit) && config.limit > 0 ? config.limit : numberFromEnv('SEARCH_SCREENSHOT_LIMIT', DEFAULT_LIMIT),
        delayMs: Number.isFinite(config.delayMs) && config.delayMs > 0 ? config.delayMs : numberFromEnv('SEARCH_SCREENSHOT_DELAY_MS', DEFAULT_DELAY_MS),
        timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : numberFromEnv('SEARCH_SCREENSHOT_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    }
}

async function search(query) {
    const body = new URLSearchParams({q: query})
    const response = await fetch(SEARCH_ENDPOINT, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': USER_AGENT,
        },
        body,
    })
    
    if (!response.ok) throw new Error(`Search returned ${response.status}`)
    const html = await response.text()
    return parseDuckDuckGoResults(html)
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function renderSearchPage(query, results) {
    const resultItems = results.slice(0, 10).map((result, index) => `
    <article class="result">
      <div class="rank">${index + 1}</div>
      <div>
        <h2>${escapeHtml(result.title)}</h2>
        <a href="${escapeHtml(result.url)}">${escapeHtml(result.url)}</a>
        <p>${escapeHtml(result.snippet || 'No snippet returned.')}</p>
      </div>
    </article>
  `).join('')
    
    return `<!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(query.label)}</title>
      <style>
        body {
          margin: 0;
          background: #f7f8fb;
          color: #111827;
          font-family: Inter, Arial, sans-serif;
        }
        main {
          width: 1120px;
          margin: 0 auto;
          padding: 40px 32px 56px;
        }
        header {
          border-bottom: 1px solid #d8dee9;
          padding-bottom: 22px;
          margin-bottom: 24px;
        }
        .eyebrow {
          color: #2563eb;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        h1 {
          margin: 0 0 12px;
          font-size: 34px;
          line-height: 1.1;
        }
        .query {
          display: inline-block;
          background: #fff;
          border: 1px solid #d8dee9;
          border-radius: 8px;
          padding: 10px 12px;
          font-family: Consolas, monospace;
          color: #334155;
        }
        .meta {
          margin-top: 12px;
          color: #64748b;
          font-size: 14px;
        }
        .result {
          display: grid;
          grid-template-columns: 42px 1fr;
          gap: 16px;
          background: #fff;
          border: 1px solid #d8dee9;
          border-radius: 10px;
          padding: 18px;
          margin-bottom: 12px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
        }
        .rank {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #dbeafe;
          color: #1d4ed8;
          font-weight: 900;
        }
        h2 {
          margin: 0 0 7px;
          font-size: 18px;
          line-height: 1.25;
        }
        a {
          display: block;
          color: #047857;
          font-size: 13px;
          text-decoration: none;
          overflow-wrap: anywhere;
          margin-bottom: 8px;
        }
        p {
          margin: 0;
          color: #475569;
          line-height: 1.45;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <main>
        <header>
          <div class="eyebrow">Search screenshot · ${escapeHtml(query.platform)} · ${escapeHtml(query.language)}</div>
          <h1>${escapeHtml(query.label)}</h1>
          <div class="query">${escapeHtml(query.query)}</div>
          <div class="meta">Rendered from public DuckDuckGo HTML results captured by the local agent.</div>
        </header>
        ${resultItems || '<p>No results returned for this query.</p>'}
      </main>
    </body>
    </html>`
}

async function writeReport(report) {
    await fs.mkdir(REPORTS_DIR, {recursive: true})
    const reportPath = path.join(REPORTS_DIR, `${report.finishedAt.replace(/[:.]/g, '-')}.json`)
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    await fs.writeFile(path.join(REPORTS_DIR, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    return reportPath
}

async function captureSearchScreenshots(config = {}) {
    const playwright = await loadPlaywright()
    const {limit, delayMs, timeoutMs} = resolveConfig(config)
    const queries = JSON.parse(await fs.readFile(QUERIES_FILE, 'utf8')).slice(0, limit)
    await fs.mkdir(REPORTS_DIR, {recursive: true})
    
    const report = {
        startedAt: timestamp(),
        finishedAt: null,
        config: {limit, delayMs, timeoutMs},
        captured: [],
        failed: [],
    }
    
    const browser = await playwright.chromium.launch({headless: true})
    const context = await browser.newContext({
        userAgent: 'StockFolioMarketingAgent/1.0 (+manual-review-search-screenshots)',
        viewport: {width: 1440, height: 1200},
        deviceScaleFactor: 1,
    })
    const page = await context.newPage()
    
    try {
        for (let index = 0; index < queries.length; index += 1) {
            const query = queries[index]
            const fileName = `${String(index + 1).padStart(2, '0')}-${slugify(query.label)}.png`
            const screenshotPath = path.join(REPORTS_DIR, fileName)
            
            try {
                const results = await search(query.query)
                if (!results.length) throw new Error('Search returned no parseable results')
                await page.setContent(renderSearchPage(query, results), {
                    waitUntil: 'domcontentloaded',
                    timeout: timeoutMs
                })
                await page.waitForTimeout(delayMs)
                await page.screenshot({path: screenshotPath, fullPage: true})
                
                report.captured.push({
                    label: query.label,
                    platform: query.platform,
                    language: query.language,
                    query: query.query,
                    url: SEARCH_ENDPOINT,
                    results: results.length,
                    screenshot: path.relative(path.join(__dirname, '..'), screenshotPath).replace(/\\/g, '/'),
                })
            } catch (error) {
                report.failed.push({
                    label: query.label,
                    query: query.query,
                    url: SEARCH_ENDPOINT,
                    error: error.message,
                })
            }
            
            if (index < queries.length - 1) await sleep(delayMs)
        }
    } finally {
        await browser.close()
    }
    
    report.finishedAt = timestamp()
    const reportPath = await writeReport(report)
    
    return {
        runLog: path.relative(path.join(__dirname, '..'), reportPath).replace(/\\/g, '/'),
        captured: report.captured.length,
        failed: report.failed.length,
        screenshots: report.captured,
    }
}

module.exports = {
    captureSearchScreenshots,
}
