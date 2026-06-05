// Shared cache layer for market data — Redis-backed when REDIS_URL is set,
// otherwise an in-process Map. Includes request coalescing so concurrent cache
// misses for the same key trigger only ONE upstream fetch (prevents thundering
// herd against Yahoo in a multi-user app).

let redis = null
const memory = new Map() // key -> { value, expiresAt }
const inflight = new Map() // key -> Promise (coalescing, per-process)

function initRedis() {
    if (!process.env.REDIS_URL) return
    try {
        const Redis = require('ioredis')
        redis = new Redis(process.env.REDIS_URL, {
            lazyConnect: false,
            maxRetriesPerRequest: 2,
            enableOfflineQueue: false,
        })
        redis.on('error', (err) => {
            // Don't crash on transient Redis issues — we degrade to direct fetches.
            console.error('[cache] redis error:', err.message)
        })
        redis.on('connect', () => console.log('[cache] Redis connected'))
    } catch (err) {
        console.warn('[cache] ioredis unavailable, using in-memory cache:', err.message)
        redis = null
    }
}

async function rawGet(key) {
    if (redis) {
        try {
            const v = await redis.get(key)
            return v == null ? undefined : JSON.parse(v)
        } catch {
            return undefined // Redis down → treat as miss
        }
    }
    const entry = memory.get(key)
    if (!entry) return undefined
    if (entry.expiresAt < Date.now()) {
        memory.delete(key)
        return undefined
    }
    return entry.value
}

async function rawSet(key, value, ttlSeconds) {
    if (redis) {
        try {
            await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
        } catch { /* ignore write failures */
        }
        return
    }
    memory.set(key, {value, expiresAt: Date.now() + ttlSeconds * 1000})
}

// Return cached value for `key`, or call fetchFn(), cache its result for
// ttlSeconds, and return it. Concurrent callers for the same key share one
// fetchFn() invocation.
async function getOrSet(key, ttlSeconds, fetchFn) {
    const hit = await rawGet(key)
    if (hit !== undefined) return hit
    
    if (inflight.has(key)) return inflight.get(key)
    
    const promise = (async () => {
        const value = await fetchFn()
        if (value !== undefined && value !== null) {
            await rawSet(key, value, ttlSeconds)
        }
        return value
    })().finally(() => inflight.delete(key))
    
    inflight.set(key, promise)
    return promise
}

async function del(key) {
    if (redis) {
        try {
            await redis.del(key)
        } catch {
        }
    }
    memory.delete(key)
}

function isRedis() {
    return !!redis
}

module.exports = {initRedis, getOrSet, get: rawGet, set: rawSet, del, isRedis}
