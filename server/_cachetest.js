const fs = require('fs')
const cache = require('./services/cacheService')
;(async () => {
    const out = []
    let calls = 0
    const fetcher = async () => {
        calls++;
        await new Promise(r => setTimeout(r, 50));
        return {v: 42}
    }
    
    // Coalescing: 5 concurrent misses → 1 fetch
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => cache.getOrSet('k', 60, fetcher)))
    out.push('coalesced calls (expect 1): ' + calls)
    out.push('all equal: ' + results.every(r => r.v === 42))
    
    // Hit: second call, no new fetch
    await cache.getOrSet('k', 60, fetcher)
    out.push('after cache hit calls (expect 1): ' + calls)
    
    // del invalidates
    await cache.del('k')
    await cache.getOrSet('k', 60, fetcher)
    out.push('after del + refetch calls (expect 2): ' + calls)
    
    fs.writeFileSync('_cachetest.txt', out.join('\n'))
    process.exit(0)
})()
