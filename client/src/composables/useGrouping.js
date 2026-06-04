// Shared grouping logic for positions / watchlist items.
// mode: 'none' | 'market' | 'group'
//
// Returns an array of { group, items } sections. In 'group' mode a stock with
// multiple tags appears under EACH of its groups, plus an "Ungrouped" bucket
// for stocks with no tags.

function marketOf(ticker) {
    return ticker.toUpperCase().endsWith('.TA') ? 'TASE' : 'US'
}

export function groupItems(items, mode) {
    if (mode === 'none' || !items?.length) {
        return [{group: null, items: items || []}]
    }
    
    if (mode === 'market') {
        const map = {}
        for (const it of items) {
            const m = marketOf(it.ticker)
            ;(map[m] ||= []).push(it)
        }
        return Object.entries(map)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([group, items]) => ({group, items}))
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
    {label: 'Groups', value: 'group'},
]
