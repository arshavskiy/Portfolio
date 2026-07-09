const fs = require('node:fs/promises')
const path = require('node:path')
const {scoreCommunity} = require('./scoring')

const DATA_DIR = path.join(__dirname, '..', 'data')
const COMMUNITIES_FILE = path.join(DATA_DIR, 'communities.json')

async function readCommunities() {
    await fs.mkdir(DATA_DIR, {recursive: true})
    
    try {
        const content = await fs.readFile(COMMUNITIES_FILE, 'utf8')
        return JSON.parse(content)
    } catch (error) {
        if (error.code === 'ENOENT') return []
        throw error
    }
}

async function writeCommunities(communities) {
    await fs.mkdir(DATA_DIR, {recursive: true})
    const sorted = [...communities]
        .map((community) => ({...community, score: scoreCommunity(community)}))
        .sort((a, b) => b.score - a.score)
    
    await fs.writeFile(COMMUNITIES_FILE, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8')
    return sorted
}

async function upsertCommunities(candidates) {
    const existing = await readCommunities()
    const byKey = new Map()
    
    for (const community of existing) {
        byKey.set(keyFor(community), community)
    }
    
    let added = 0
    let updated = 0
    
    for (const candidate of candidates) {
        const key = keyFor(candidate)
        const current = byKey.get(key)
        
        if (!current) {
            byKey.set(key, candidate)
            added += 1
            continue
        }
        
        byKey.set(key, {
            ...current,
            ...compact(candidate),
            id: current.id,
            source: current.source || candidate.source,
            discoveredAt: current.discoveredAt || candidate.discoveredAt,
            updatedAt: new Date().toISOString(),
        })
        updated += 1
    }
    
    const communities = await writeCommunities([...byKey.values()])
    return {communities, added, updated}
}

function keyFor(community) {
    if (community.canonicalId) return String(community.canonicalId).toLowerCase()
    return normalizeUrl(community.url) || slugify(`${community.platform}-${community.name}`)
}

function normalizeUrl(url) {
    if (!url) return ''
    try {
        const parsed = new URL(url)
        parsed.hash = ''
        parsed.searchParams.sort()
        return parsed.toString().replace(/\/$/, '')
    } catch {
        return url.trim().toLowerCase().replace(/\/$/, '')
    }
}

function compact(value) {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''))
}

function slugify(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

module.exports = {
    readCommunities,
    writeCommunities,
    upsertCommunities,
    slugify,
}
