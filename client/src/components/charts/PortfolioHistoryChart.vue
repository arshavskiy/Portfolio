<script setup>
import {nextTick, onMounted, ref, watch} from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  data: {type: Array, default: () => []}, // [{ date, value, cost, firstBuyDate, txDates }]
  loading: {type: Boolean, default: false},
  // Live day P&L (USD) from the portfolio totals — authoritative "today
  // red/green" signal, matching what the rest of the dashboard shows.
  dayPnl: {type: Number, default: null},
})

const svgRef = ref(null)
const wrapRef = ref(null)

function draw() {
  if (!svgRef.value || !wrapRef.value || !props.data.length) return
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const W = wrapRef.value.clientWidth || 320
  const H = 120
  svg.attr('width', W).attr('height', H)

  const data = props.data
  const last = data[data.length - 1]
  const prev = data[data.length - 2] ?? last
  // Color reflects today's actual move, not the move over the whole selected
  // range — otherwise "All" can show green on a red day just because the
  // portfolio is up since 1999. Prefer the live dayPnl (matches the rest of
  // the dashboard); fall back to the history's own last-day close diff.
  const isWin = props.dayPnl != null ? props.dayPnl >= 0 : last.value >= (prev.value || 0)
  const color = isWin ? '#00ff88' : '#ff3366'

  const x = d3.scaleLinear().domain([0, data.length - 1]).range([0, W])
  const yMin = d3.min(data, (d) => Math.min(d.value, d.cost))
  const yMax = d3.max(data, (d) => Math.max(d.value, d.cost))
  const yPad = (yMax - yMin) * 0.1 || 1
  const y = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([H - 2, 2])

  // Glow filter (same as SparklineChart)
  const defs = svg.append('defs')
  const filterId = `glow-${Math.random().toString(36).slice(2)}`
  const filter = defs.append('filter').attr('id', filterId)
  filter.append('feGaussianBlur').attr('stdDeviation', '2.5').attr('result', 'blur')
  const feMerge = filter.append('feMerge')
  feMerge.append('feMergeNode').attr('in', 'blur')
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

  // Area fill under value line
  const area = d3.area()
      .x((_, i) => x(i))
      .y0(H)
      .y1((d) => y(d.value))
      .curve(d3.curveMonotoneX)

  svg.append('path')
      .datum(data)
      .attr('fill', isWin ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,102,0.08)')
      .attr('d', area)

  // Cost basis baseline (dashed, muted)
  const costLine = d3.line()
      .x((_, i) => x(i))
      .y((d) => y(d.cost))
      .curve(d3.curveMonotoneX)

  svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#64748b')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 3')
      .attr('d', costLine)

  // Value line with glow
  const line = d3.line()
      .x((_, i) => x(i))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX)

  svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1.5)
      .attr('filter', `url(#${filterId})`)
      .attr('d', line)

  // First-buy marker: vertical dashed line where the portfolio actually
  // started, so the $0 stretch before it reads as "pre-buy", not a bug.
  const firstBuyDate = data[0]?.firstBuyDate
  if (firstBuyDate && firstBuyDate > data[0].date) {
    let buyIdx = data.findIndex((d) => d.date >= firstBuyDate)
    if (buyIdx === -1) buyIdx = data.length - 1
    const bx = x(buyIdx)

    svg.append('line')
        .attr('x1', bx).attr('x2', bx)
        .attr('y1', 0).attr('y2', H)
        .attr('stroke', '#94a3b8')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3 3')
        .attr('opacity', 0.6)

    svg.append('text')
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
    svg.append('circle')
        .attr('cx', x(idx))
        .attr('cy', y(data[idx].value))
        .attr('r', 3)
        .attr('fill', '#0f172a')
        .attr('stroke', '#94a3b8')
        .attr('stroke-width', 1.5)
  })
}

let ro
onMounted(() => {
  nextTick(draw)
  ro = new ResizeObserver(() => draw())
  if (wrapRef.value) ro.observe(wrapRef.value)
})
watch(() => props.data, () => nextTick(draw), {deep: true})
watch(() => props.dayPnl, () => nextTick(draw))
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
    <div v-if="loading" class="hist-state">Loading…</div>
    <div v-else-if="!data.length" class="hist-state">Not enough history yet</div>
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
  height: 120px;
}

.hist-state {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
}
</style>
