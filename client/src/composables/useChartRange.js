import {useStorage} from '@vueuse/core'

const range = useStorage('chart-range', '1mo')

export function useChartRange() {
    return range
}
