// Shared grouping logic for positions / watchlist items.
// mode: 'market' | 'change' | 'pre' | 'post' | 'industry' | 'group'
//
// Returns an array of { group, items } sections. In 'group' mode a stock with
// multiple tags appears under EACH of its groups, plus an "Ungrouped" bucket
// for stocks with no tags.
import {getMarketHoursState, MARKET_HOURS_BY_GROUP} from './useMarketHours.js'
import {useMomentumStore} from '@/stores/momentum.js'

function marketOf(ticker) {
    const t = ticker.toUpperCase()
    if (/-USD$/.test(t)) return 'Crypto'
    if (t.endsWith('.TA')) return 'TASE'
    return 'US'
}

function classifyOf(item, field) {
    const value = typeof item?.[field] === 'string' ? item[field].trim() : ''
    return value || 'Unclassified'
}

function marketRank(group) {
    const ranks = {
        TASE: 0,
        US: 1,
        Crypto: 2,
    }
    return ranks[group] ?? 99
}

function marketState(group, date) {
    const marketKey = {
        TASE: 'Israel',
        US: 'US',
        Crypto: 'Crypto',
    }[group]
    const market = marketKey ? MARKET_HOURS_BY_GROUP[marketKey] : null
    return market ? getMarketHoursState(market, date) : null
}

function defaultGroupSort(a, b) {
    if (a === 'Unclassified') return 1
    if (b === 'Unclassified') return -1
    return a.localeCompare(b)
}

function itemSortKey(item) {
    return `${String(item?.ticker || '').toUpperCase()}\u0000${String(item?.companyName || item?.name || '')}`.trim()
}

function sortItemsAscending(items) {
    return [...items].sort((a, b) => itemSortKey(a).localeCompare(itemSortKey(b)))
}

function changeValueOf(item) {
    const history = Array.isArray(item?.history) ? item.history : []
    const start = history[0]?.close
    const end = history[history.length - 1]?.close
    if (typeof start === 'number' && typeof end === 'number' && start !== 0) {
        return ((end - start) / start) * 100
    }
    return typeof item?.changePercent === 'number' ? item.changePercent : null
}

function preValueOf(item) {
    const values = [
        item?.preMarketChangePercent,
        item?.lastPreMarketChangePercent,
    ]
    return values.find((value) => typeof value === 'number' && Number.isFinite(value)) ?? null
}

function postValueOf(item) {
    const values = [
        item?.postMarketChangePercent,
        item?.lastPostMarketChangePercent,
    ]
    return values.find((value) => typeof value === 'number' && Number.isFinite(value)) ?? null
}

function extWeight(pct) {
    if (pct == null) return 0
    const abs = Math.abs(pct)
    const sign = pct > 0 ? 1 : -1
    if (abs > 5)   return sign * 3
    if (abs > 2)   return sign * 2
    if (abs > 0.5) return sign * 1
    return 0
}

function dayWeight(pct) {
    if (pct == null) return 0
    if (pct > 3)  return 2
    if (pct > 0)  return 1
    if (pct < -3) return -2
    if (pct < 0)  return -1
    return 0
}

function activeExtValueOf(item) {
    const nowNy = new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})
    const d = new Date(nowNy)
    const minutes = d.getHours() * 60 + d.getMinutes()
    const isPreTime = minutes < 9 * 60 + 30
    // Mirror WatchRow: pre before 09:30, post after
    return isPreTime
        ? (preValueOf(item) ?? postValueOf(item))
        : (postValueOf(item) ?? preValueOf(item))
}

export function momentumScoreOf(item) {
    let score = 0

    // Pre/post-market (weighted ±3) — time-aware to match WatchRow badge
    const ext = activeExtValueOf(item)
    score += extWeight(ext)

    // Today's session (weighted ±2)
    const dayPct = typeof item?.changePercent === 'number' ? item.changePercent : null
    score += dayWeight(dayPct)

    // Week trend: first vs last close (±1)
    const hist = Array.isArray(item?.history) ? item.history : []
    if (hist.length >= 2) {
        const first = hist[0]?.close
        const last  = hist[hist.length - 1]?.close
        if (first != null && last != null && first !== 0) {
            if (last > first) score += 1
            else if (last < first) score -= 1
        }

        // Price vs week SMA (±1)
        const closes = hist.map(h => h.close).filter(v => v != null)
        if (closes.length >= 3 && item?.price != null) {
            const sma = closes.reduce((a, b) => a + b, 0) / closes.length
            if (item.price > sma) score += 1
            else if (item.price < sma) score -= 1
        }
    }

    return score
}

function buildSingleFieldSections(items, getGroup, sortGroups = defaultGroupSort) {
    const map = {}
    for (const it of items) {
        const group = getGroup(it)
        ;(map[group] ||= []).push(it)
    }
    return Object.entries(map)
        .sort(([a], [b]) => sortGroups(a, b))
        .map(([group, groupedItems]) => ({group, items: sortItemsAscending(groupedItems)}))
}

export function groupItems(items, mode, date = new Date(), changeDirection = 'down') {
    if (!items?.length) {
        return [{group: null, items: items || []}]
    }

    if (mode === 'market') {
        return buildSingleFieldSections(
            items,
            (it) => marketOf(it.ticker),
            (a, b) => {
                const aState = marketState(a, date)
                const bState = marketState(b, date)
                if (aState?.isOpen !== bState?.isOpen) return aState?.isOpen ? -1 : 1
                const rankDiff = marketRank(a) - marketRank(b)
                return rankDiff || defaultGroupSort(a, b)
            }
        )
    }

    if (mode === 'change') {
        // 'down' = gainers first (biggest positive change up top, default).
        // 'up' = losers first (biggest negative change up top).
        const sign = changeDirection === 'up' ? -1 : 1
        const sortedItems = [...items].sort((a, b) => {
            const aChange = changeValueOf(a)
            const bChange = changeValueOf(b)
            if (aChange == null && bChange == null) return 0
            if (aChange == null) return 1
            if (bChange == null) return -1
            return (bChange - aChange) * sign
        })
        return [{group: null, items: sortedItems}]
    }
    
    if (mode === 'pre' || mode === 'post' || mode === 'extended') {
        const sign = changeDirection === 'up' ? -1 : 1
        // 'extended' picks pre vs post based on current time: pre before/during open, post after
        let valueOf
        if (mode === 'extended') {
            const usMarket = {
                days: [1, 2, 3, 4, 5],
                sessions: [{start: '09:30', end: '16:00'}],
                timezone: 'America/New_York'
            }
            const nowNy = new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})
            const d = new Date(nowNy)
            const minutes = d.getHours() * 60 + d.getMinutes()
            const isPreTime = minutes < 9 * 60 + 30
            valueOf = isPreTime ? preValueOf : postValueOf
        } else {
            valueOf = mode === 'pre' ? preValueOf : postValueOf
        }
        const sortedItems = [...items].sort((a, b) => {
            const aChange = valueOf(a)
            const bChange = valueOf(b)
            if (aChange == null && bChange == null) return 0
            if (aChange == null) return 1
            if (bChange == null) return -1
            return (bChange - aChange) * sign
        })
        return [{group: null, items: sortedItems}]
    }
    
    if (mode === 'momentum') {
        // Use published combined scores from WatchRow (includes wave vote).
        // Fall back to momentumScoreOf() for rows not yet rendered.
        const momentumStore = useMomentumStore()
        const scoreOf = (item) => momentumStore.getScore(item.ticker) ?? momentumScoreOf(item)

        // 'down' = bullish first (highest positive score at top)
        // 'up'   = bearish first (most negative score at top)
        // Zero-score items always sink to the bottom.
        const bullishFirst = changeDirection !== 'up'
        const sortedItems = [...items].sort((a, b) => {
            const sa = scoreOf(a)
            const sb = scoreOf(b)
            if (sa === 0 && sb === 0) return itemSortKey(a).localeCompare(itemSortKey(b))
            if (sa === 0) return 1
            if (sb === 0) return -1
            const diff = bullishFirst ? sb - sa : sa - sb
            return diff !== 0 ? diff : itemSortKey(a).localeCompare(itemSortKey(b))
        })
        return [{group: null, items: sortedItems}]
    }

    if (mode === 'industry') {
        return buildSingleFieldSections(items, (it) => classifyOf(it, 'industry'))
    }
    
    // mode === 'group'
    const map = {}
    const ungrouped = []
    for (const it of items) {
        const tags = Array.isArray(it.groups) ? it.groups.filter(Boolean) : []
        if (!tags.length) {
            ungrouped.push(it)
            continue
        }
        for (const tag of tags) {
            ;(map[tag] ||= []).push(it)
        }
    }
    const sections = Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([group, items]) => ({group, items: sortItemsAscending(items)}))
    if (ungrouped.length) sections.push({group: 'Ungrouped', items: sortItemsAscending(ungrouped)})
    return sections
}

export const GROUP_MODES = [
    {label: 'Market', value: 'market'},
    {label: 'Change', value: 'change'},
    {label: 'Pre/Post', value: 'extended'},
    {label: '▲', value: 'momentum', title: 'Sort by momentum signal'},
    {label: 'Industry', value: 'industry'},
    {label: 'Groups', value: 'group'},
]
