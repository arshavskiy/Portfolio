const DB_NAME = 'portfolio-client-cache'
const STORE_NAME = 'responses'
const DB_VERSION = 1

const memoryCache = new Map()
const inflight = new Map()
let dbPromise = null

function canUseIndexedDb() {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

function openCacheDb() {
  if (!canUseIndexedDb()) return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {keyPath: 'key'})
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })

  return dbPromise
}

async function readPersistentEntry(key) {
  const db = await openCacheDb()
  if (!db) return null

  return new Promise((resolve) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => resolve(null)
  })
}

async function writePersistentEntry(entry) {
  const db = await openCacheDb()
  if (!db) return

  await new Promise((resolve) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
  })
}

function isFresh(entry, ttlMs) {
  return entry && Date.now() - entry.savedAt < ttlMs
}

export async function cachedFetch(key, ttlMs, fetcher, {force = false, allowStale = true, onCacheMeta = null} = {}) {
  const memory = memoryCache.get(key)
  if (!force && isFresh(memory, ttlMs)) {
    onCacheMeta?.({key, source: 'memory', cached: true, stale: false, savedAt: memory.savedAt})
    return memory.data
  }

  const stored = await readPersistentEntry(key)
  if (!force && isFresh(stored, ttlMs)) {
    memoryCache.set(key, stored)
    onCacheMeta?.({key, source: 'indexeddb', cached: true, stale: false, savedAt: stored.savedAt})
    return stored.data
  }

  if (!force && inflight.has(key)) return inflight.get(key)

  const request = (async () => {
    try {
      const data = await fetcher()
      const entry = {key, data, savedAt: Date.now()}
      memoryCache.set(key, entry)
      await writePersistentEntry(entry)
      onCacheMeta?.({key, source: 'network', cached: false, stale: false, savedAt: entry.savedAt})
      return data
    } catch (error) {
      const fallback = stored || memory
      if (allowStale && fallback) {
        onCacheMeta?.({key, source: fallback === stored ? 'indexeddb' : 'memory', cached: true, stale: true, savedAt: fallback.savedAt})
        return fallback.data
      }
      throw error
    } finally {
      if (inflight.get(key) === request) inflight.delete(key)
    }
  })()

  inflight.set(key, request)
  return request
}

export async function setClientCacheEntry(key, data, savedAt = Date.now()) {
  const entry = {key, data, savedAt}
  memoryCache.set(key, entry)
  await writePersistentEntry(entry)
  return entry
}

export async function invalidateClientCacheKey(key) {
  memoryCache.delete(key)
  const db = await openCacheDb()
  if (!db) return

  await new Promise((resolve) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
  })
}

export async function invalidateClientCachePrefix(prefix) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key)
  }

  const db = await openCacheDb()
  if (!db) return

  await new Promise((resolve) => {
    const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
    const request = store.openCursor()

    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }
      if (String(cursor.key).startsWith(prefix)) cursor.delete()
      cursor.continue()
    }
    request.onerror = () => resolve()
  })
}
