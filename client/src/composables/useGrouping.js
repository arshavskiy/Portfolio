// Shared grouping logic for positions / watchlist items.
// mode: 'none' | 'market' | 'change' | 'sector' | 'industry' | 'group'
//
// Returns an array of { group, items } sections. In 'group' mode a stock with
// multiple tags appears under EACH of its groups, plus an "Ungrouped" bucket
// for stocks with no tags.
import {getMarketHoursState, MARKET_HOURS_BY_GROUP} from '@/composables/useMarketHours'

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

function changeValueOf(item) {
    const history = Array.isArray(item?.history) ? item.history : []
    const start = history[0]?.close
    const end = history[history.length - 1]?.close
    if (typeof start === 'number' && typeof end === 'number' && start !== 0) {
        return ((end - start) / start) * 100
    }
    return typeof item?.changePercent === 'number' ? item.changePercent : null
}

function buildSingleFieldSections(items, getGroup, sortGroups = defaultGroupSort) {
    const map = {}
    for (const it of items) {
        const group = getGroup(it)
        ;(map[group] ||= []).push(it)
    }
    return Object.entries(map)
        .sort(([a], [b]) => sortGroups(a, b))
        .map(([group, groupedItems]) => ({group, items: groupedItems}))
}

export function groupItems(items, mode, date = new Date(), changeDirection = 'down') {
    if (mode === 'none' || !items?.length) {
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
    
    if (mode === 'sector') {
        return buildSingleFieldSections(items, (it) => classifyOf(it, 'sector'))
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
        .map(([group, items]) => ({group, items}))
    if (ungrouped.length) sections.push({group: 'Ungrouped', items: ungrouped})
    return sections
}

export const GROUP_MODES = [
    {label: 'None', value: 'none'},
    {label: 'Market', value: 'market'},
    {label: 'Change', value: 'change'},
    {label: 'Sector', value: 'sector'},
    {label: 'Industry', value: 'industry'},
    {label: 'Groups', value: 'group'},
]
