import {useStorage} from '@vueuse/core'

const range = useStorage('chart-range', '1d')

export function useChartRange() {
    return range
}
