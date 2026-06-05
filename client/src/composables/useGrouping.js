// Shared grouping logic for positions / watchlist items.
// mode: 'none' | 'market' | 'sector' | 'industry' | 'group'
//
// Returns an array of { group, items } sections. In 'group' mode a stock with
// multiple tags appears under EACH of its groups, plus an "Ungrouped" bucket
// for stocks with no tags.

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

function buildSingleFieldSections(items, getGroup) {
    const map = {}
    for (const it of items) {
        const group = getGroup(it)
        ;(map[group] ||= []).push(it)
    }
    return Object.entries(map)
        .sort(([a], [b]) => {
            if (a === 'Unclassified') return 1
            if (b === 'Unclassified') return -1
            return a.localeCompare(b)
        })
        .map(([group, groupedItems]) => ({group, items: groupedItems}))
}

export function groupItems(items, mode) {
    if (mode === 'none' || !items?.length) {
        return [{group: null, items: items || []}]
    }
    
    if (mode === 'market') {
        return buildSingleFieldSections(items, (it) => marketOf(it.ticker))
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
    {label: 'Sector', value: 'sector'},
    {label: 'Industry', value: 'industry'},
    {label: 'Groups', value: 'group'},
]
