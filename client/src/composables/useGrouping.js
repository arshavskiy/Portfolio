// Shared grouping logic for positions / watchlist items.
// mode: 'market' | 'change' | 'pre' | 'post' | 'industry' | 'group'
//
// Returns an array of { group, items } sections. In 'group' mode a stock with
// multiple tags appears under EACH of its groups, plus an "Ungrouped" bucket
// for stocks with no tags.
import {getMarketHoursState, MARKET_HOURS_BY_GROUP} from './useMarketHours.js'

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
    
    if (mode === 'pre' || mode === 'post') {
        const sign = changeDirection === 'up' ? -1 : 1
        const valueOf = mode === 'pre' ? preValueOf : postValueOf
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
    {label: 'Pre', value: 'pre'},
    {label: 'Post', value: 'post'},
    {label: 'Industry', value: 'industry'},
    {label: 'Groups', value: 'group'},
]
