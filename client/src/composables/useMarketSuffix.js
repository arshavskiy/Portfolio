import {computed} from 'vue'
import {useStorage} from '@vueuse/core'

export const MARKETS = [
    {label: '🇺🇸 US', value: '', placeholder: 'AAPL, Apple...'},
    {label: '🇮🇱 Israel', value: '.TA', placeholder: 'TEVA.TA, Teva...'},
    {label: '🇬🇧 UK', value: '.L', placeholder: 'HSBA.L, HSBC...'},
    {label: '🇩🇪 Germany', value: '.DE', placeholder: 'SAP.DE, SAP...'},
    {label: '🇫🇷 France', value: '.PA', placeholder: 'MC.PA, LVMH...'},
    {label: '🇨🇦 Canada', value: '.TO', placeholder: 'RY.TO, RBC...'},
    {label: '🇦🇺 Australia', value: '.AX', placeholder: 'BHP.AX, BHP...'},
    {label: '🇯🇵 Japan', value: '.T', placeholder: '7203.T, Toyota...'},
    {label: '🇭🇰 Hong Kong', value: '.HK', placeholder: '0700.HK, Tencent...'},
]

export function useMarketSuffix(storageKey = 'add-market-suffix') {
    const suffix = useStorage(storageKey, '')
    const selected = computed(() => MARKETS.find((m) => m.value === suffix.value) || MARKETS[0])
    
    function applyTo(ticker) {
        if (!suffix.value) return ticker
        if (ticker.toUpperCase().endsWith(suffix.value.toUpperCase())) return ticker
        return `${ticker}${suffix.value}`
    }
    
    function searchQuery(raw) {
        const stripped = suffix.value && raw.toUpperCase().endsWith(suffix.value.toUpperCase())
            ? raw.slice(0, -suffix.value.length)
            : raw
        return suffix.value ? `${stripped}${suffix.value}` : stripped
    }
    
    return {suffix, selected, applyTo, searchQuery}
}
