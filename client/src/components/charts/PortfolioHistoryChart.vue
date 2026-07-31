<script setup>
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import * as d3 from 'd3'
import {useI18n} from '@/composables/useI18n'
import AppLoader from '@/components/ui/AppLoader.vue'

const props = defineProps({
  data: {type: Array, default: () => []}, // [{ date, value, cost, firstBuyDate, txDates }]
  loading: {type: Boolean, default: false},
  hideLoading: {type: Boolean, default: false},
  // Live day P&L (USD) from the portfolio totals — authoritative "today
  // red/green" signal, matching what the rest of the dashboard shows.
  dayPnl: {type: Number, default: null},
  range: {type: String, default: ''},
})
const {t} = useI18n()

const svgRef = ref(null)
const wrapRef = ref(null)
const dataSignature = computed(() => {
  const first = props.data[0]
  const last = props.data[props.data.length - 1]
  return `${props.range}:${props.data.length}:${first?.date ?? ''}:${last?.date ?? ''}:${last?.value ?? ''}:${last?.cost ?? ''}`
})

function draw() {
  if (!svgRef.value || !wrapRef.value || !props.data.length) return
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const W = wrapRef.value.clientWidth || 320
  const H = 180
  const margin = {top: 8, right: 8, bottom: 30, left: 48}
  const innerW = Math.max(W - margin.left - margin.right, 40)
  const innerH = Math.max(H - margin.top - margin.bottom, 40)
  svg.attr('width', W).attr('height', H)
  svg.attr('viewBox', `0 0 ${W} ${H}`)

  const data = props.data
  const last = data[data.length - 1]
  const prev = data[data.length - 2] ?? last
  // Color reflects today's actual move, not the move over the whole selected
  // range — otherwise "All" can show green on a red day just because the
  // portfolio is up since 1999. Prefer the live dayPnl (matches the rest of
  // the dashboard); fall back to the history's own last-day close diff.
  const isWin = props.dayPnl != null ? props.dayPnl >= 0 : last.value >= (prev.value || 0)
  const rootStyle = getComputedStyle(document.documentElement)
  const winColor = rootStyle.getPropertyValue('--green').trim()
  const loseColor = rootStyle.getPropertyValue('--red').trim()
  const color = isWin ? winColor : loseColor

  const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  const parseDate = (value) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const points = data.map((d, i) => ({
    ...d,
    index: i,
    parsedDate: parseDate(d.date),
  }))

  const hasDates = points.every((point) => point.parsedDate)
  const x = hasDates
    ? d3.scaleTime().domain(d3.extent(points, (d) => d.parsedDate)).range([0, innerW])
    : d3.scaleLinear().domain([0, points.length - 1]).range([0, innerW])
  const yMin = d3.min(data, (d) => Math.min(d.value, d.cost))
  const yMax = d3.max(data, (d) => Math.max(d.value, d.cost))
  const yPad = (yMax - yMin) * 0.14 || 1
  const y = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([innerH, 0]).nice(4)

  const yTicks = y.ticks(4)
  chart.selectAll('.y-grid')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('class', 'y-grid')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#333')
      .attr('stroke-width', 1)

  chart.selectAll('.y-label')
      .data(yTicks)
      .enter()
      .append('text')
      .attr('x', -10)
      .attr('y', (d) => y(d))
      .attr('dy', '0.32em')
      .attr('text-anchor', 'end')
      .attr('fill', '#a0958d')
      .attr('font-size', 10)
      .text((d) => {
        if (Math.abs(d) >= 1000) return `${Math.round(d / 1000)}K`
        return d3.format('~f')(d)
      })

  // Value line
  const line = d3.line()
      .x((d) => hasDates ? x(d.parsedDate) : x(d.index))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX)

  chart.append('path')
      .datum(points)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1.8)
      .attr('d', line)

  const axisTickCount = Math.min(8, Math.max(4, Math.floor(W / 90)))
  const xTicks = hasDates
    ? x.ticks(axisTickCount)
    : points.filter((_, index) => index % Math.max(1, Math.floor(points.length / axisTickCount)) === 0).map((d) => d.index)

  chart.selectAll('.x-label')
      .data(xTicks)
      .enter()
      .append('text')
      .attr('x', (d) => hasDates ? x(d) : x(d))
      .attr('y', innerH + 20)
      .attr('text-anchor', 'middle')
      .attr('fill', '#a0958d')
      .attr('font-size', 10)
      .text((d) => {
        if (!hasDates) return ''
        return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})
      })

  // First-buy marker: vertical dashed line where the portfolio actually
  // started, so the $0 stretch before it reads as "pre-buy", not a bug.
  const firstBuyDate = data[0]?.firstBuyDate
  if (firstBuyDate && firstBuyDate > data[0].date) {
    let buyIdx = data.findIndex((d) => d.date >= firstBuyDate)
    if (buyIdx === -1) buyIdx = data.length - 1
    const buyPoint = points[buyIdx]
    const bx = hasDates ? x(buyPoint.parsedDate) : x(buyIdx)

    chart.append('line')
        .attr('x1', bx).attr('x2', bx)
        .attr('y1', 0).attr('y2', innerH)
        .attr('stroke', '#94a3b8')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3 3')
        .attr('opacity', 0.6)

    chart.append('text')
        .attr('x', bx + 4).attr('y', 11)
        .attr('fill', '#94a3b8')
        .attr('font-size', '9')
        .text('Buy')
  }

  // Tx markers: a small dot on the value line for every day a buy/sell
  // happened in this range — without these, a deposit-driven jump (e.g.
  // adding new cash + buys) looks like a broken/glitched chart instead of
  // a real, explainable step in value.
  const txDates = data[0]?.txDates || []
  txDates.forEach((txDate) => {
    if (txDate === firstBuyDate) return // already marked above
    const idx = data.findIndex((d) => d.date >= txDate)
    if (idx === -1) return
    const point = points[idx]
    chart.append('circle')
        .attr('cx', hasDates ? x(point.parsedDate) : x(idx))
        .attr('cy', y(point.value))
        .attr('r', 2.5)
        .attr('fill', '#2a2826')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1)
  })
}

let ro
onMounted(() => {
  nextTick(draw)
  ro = new ResizeObserver(() => draw())
  if (wrapRef.value) ro.observe(wrapRef.value)
})
onUnmounted(() => {
  if (ro) ro.disconnect()
})
watch(dataSignature, () => nextTick(draw), {flush: 'post'})
watch(() => props.dayPnl, () => nextTick(draw), {flush: 'post'})
// The <svg> is torn down/recreated by the loading/empty v-if branches in the
// template, so svgRef goes null while loading. Re-attach the ResizeObserver
// and redraw once it reappears — otherwise a range switch can leave the old
// range's chart on screen if data arrives in the same tick as the DOM swap.
watch(() => props.loading, async (isLoading) => {
  if (isLoading) return
  await nextTick()
  if (ro && wrapRef.value) ro.observe(wrapRef.value)
  draw()
})
</script>

<template>
  <div ref="wrapRef" class="hist-wrap">
    <div v-if="loading && !hideLoading" class="hist-state">
      <AppLoader/>
    </div>
    <div v-else-if="!loading && !data.length" class="hist-state">{{ t('dashboard.notEnoughHistory') }}</div>
    <svg v-else ref="svgRef" class="hist-svg"/>
  </div>
</template>

<style scoped>
.hist-wrap {
  width: 100%;
}

.hist-svg {
  display: block;
  width: 100%;
  height: 180px;
}

.hist-state {
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
}
</style>
