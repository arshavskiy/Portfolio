const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const {readCommunities} = require('./lib/communityStore')
const {runDiscovery} = require('./lib/discovery')
const {runPublicScrape} = require('./lib/publicScrape')

const PORT = Number(process.env.PORT || 4177)
const ROOT = __dirname

const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
}

let discoveryRunning = false
let scrapeRunning = false

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`)
        
        if (req.method === 'GET' && url.pathname === '/api/communities') {
            return sendJson(res, {communities: await readCommunities()})
        }
        
        if (req.method === 'POST' && url.pathname === '/api/discover') {
            if (discoveryRunning) {
                return sendJson(res, {error: 'Discovery is already running'}, 409)
            }
            
            discoveryRunning = true
            try {
                const result = await runDiscovery()
                return sendJson(res, result)
            } finally {
                discoveryRunning = false
            }
        }
        
        if (req.method === 'POST' && url.pathname === '/api/scrape') {
            if (scrapeRunning) {
                return sendJson(res, {error: 'Playwright verification is already running'}, 409)
            }
            
            scrapeRunning = true
            try {
                const result = await runPublicScrape()
                return sendJson(res, result)
            } finally {
                scrapeRunning = false
            }
        }
        
        if (req.method !== 'GET') {
            return sendText(res, 'Method not allowed', 405)
        }
        
        return serveStatic(url.pathname, res)
    } catch (error) {
        console.error(error)
        return sendJson(res, {error: error.message || 'Server error'}, 500)
    }
})

async function serveStatic(pathname, res) {
    const cleanPath = pathname === '/' ? '/index.html' : pathname
    const filePath = path.normalize(path.join(ROOT, cleanPath))
    const relativePath = path.relative(ROOT, filePath)
    
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return sendText(res, 'Forbidden', 403)
    }
    
    try {
        const body = await fs.readFile(filePath)
        const type = contentTypes[path.extname(filePath)] || 'application/octet-stream'
        res.writeHead(200, {'content-type': type})
        res.end(body)
    } catch (error) {
        if (error.code === 'ENOENT') return sendText(res, 'Not found', 404)
        throw error
    }
}

function sendJson(res, payload, status = 200) {
    res.writeHead(status, {'content-type': 'application/json; charset=utf-8'})
    res.end(JSON.stringify(payload))
}

function sendText(res, body, status = 200) {
    res.writeHead(status, {'content-type': 'text/plain; charset=utf-8'})
    res.end(body)
}

server.listen(PORT, () => {
    console.log(`StockFolio Marketing Agent running at http://localhost:${PORT}`)
})
