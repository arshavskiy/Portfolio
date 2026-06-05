<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  mode: { type: String, default: 'line' }, // 'line' | 'candle'
  currentPrice: { type: Number, default: null },
})

const svgRef = ref(null)
const tooltipRef = ref(null)
const containerRef = ref(null)

function draw() {
  if (!svgRef.value || !props.data.length) return

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const W = containerRef.value.clientWidth
  const H = 240
  const margin = { top: 10, right: 12, bottom: 30, left: 60 }
  const w = W - margin.left - margin.right
  const h = H - margin.top - margin.bottom

  svg.attr('width', W).attr('height', H)
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  const parsed = props.data.map((d) => ({ ...d, date: new Date(d.date) }))

  const x = d3.scaleTime().domain(d3.extent(parsed, (d) => d.date)).range([0, w])
  const yMin = d3.min(parsed, (d) => props.mode === 'candle' ? d.low : d.close)
  const yMax = d3.max(parsed, (d) => props.mode === 'candle' ? d.high : d.close)
  const yPad = (yMax - yMin) * 0.05 || 1
  const y = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([h, 0])

  const first = parsed[0]?.close
  const last = parsed[parsed.length - 1]?.close
  const isUp = last >= first
  const color = isUp ? '#22c55e' : '#ef4444'

  // Grid
  g.append('g')
    .call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat(''))
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line').attr('stroke', '#334155').attr('stroke-dasharray', '2,4'))

  if (props.mode === 'candle') {
    const bandW = Math.max(1, (w / parsed.length) * 0.6)

    // Wicks
    g.selectAll('.wick')
      .data(parsed)
      .enter().append('line')
      .attr('x1', (d) => x(d.date))
      .attr('x2', (d) => x(d.date))
      .attr('y1', (d) => y(d.high))
      .attr('y2', (d) => y(d.low))
      .attr('stroke', (d) => d.close >= d.open ? '#22c55e' : '#ef4444')
      .attr('stroke-width', 1)

    // Bodies
    g.selectAll('.candle')
      .data(parsed)
      .enter().append('rect')
      .attr('x', (d) => x(d.date) - bandW / 2)
      .attr('y', (d) => y(Math.max(d.open, d.close)))
      .attr('width', bandW)
      .attr('height', (d) => Math.max(1, Math.abs(y(d.open) - y(d.close))))
      .attr('fill', (d) => d.close >= d.open ? '#22c55e' : '#ef4444')

  } else {
    // Area fill
    g.append('path')
      .datum(parsed)
      .attr('fill', isUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)')
      .attr('d', d3.area().x((d) => x(d.date)).y0(h).y1((d) => y(d.close)).curve(d3.curveMonotoneX))

    // Line
    g.append('path')
      .datum(parsed)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1.5)
      .attr('d', d3.line().x((d) => x(d.date)).y((d) => y(d.close)).curve(d3.curveMonotoneX))
  }

  // X axis
  g.append('g').attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat('%b %d')))
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line').remove())
    .call((g) => g.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '10'))

  // Y axis
  g.append('g')
    .call(d3.axisLeft(y).ticks(4).tickFormat((d) => `$${d3.format(',.0f')(d)}`))
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line').remove())
    .call((g) => g.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '10'))

  if (Number.isFinite(props.currentPrice)) {
    const priceY = y(props.currentPrice)
    if (priceY >= 0 && priceY <= h) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', w)
        .attr('y1', priceY)
        .attr('y2', priceY)
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '6,4')

      const labelWidth = 56
      const labelHeight = 18
      const labelX = Math.max(0, w - labelWidth)
      const labelY = Math.min(Math.max(0, priceY - labelHeight / 2), h - labelHeight)

      g.append('rect')
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('width', labelWidth)
        .attr('height', labelHeight)
        .attr('rx', 4)
        .attr('fill', '#0f172a')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 1)

      g.append('text')
        .attr('x', labelX + labelWidth / 2)
        .attr('y', labelY + 12)
        .attr('text-anchor', 'middle')
        .attr('fill', '#f8fafc')
        .attr('font-size', '10')
        .attr('font-weight', 600)
        .text(props.currentPrice.toFixed(2))
    }
  }

  // Crosshair + tooltip
  const bisect = d3.bisector((d) => d.date).left
  const focus = g.append('g').style('display', 'none')
  focus.append('line').attr('y1', 0).attr('y2', h)
    .attr('stroke', '#94a3b8').attr('stroke-dasharray', '3,3').attr('stroke-width', 1)
  focus.append('circle').attr('r', 4).attr('fill', color).attr('stroke', '#0f172a').attr('stroke-width', 2)

  const tooltip = d3.select(tooltipRef.value)

  svg.append('rect')
    .attr('width', W).attr('height', H).attr('fill', 'none').attr('pointer-events', 'all')
    .on('mousemove touchmove', (event) => {
      const [mx] = d3.pointer(event)
      const date = x.invert(mx - margin.left)
      const i = bisect(parsed, date, 1)
      const d0 = parsed[i - 1]; const d1 = parsed[i]
      if (!d0 && !d1) return
      const d = d1 && date - d0?.date > d1?.date - date ? d1 : d0
      if (!d) return

      focus.style('display', null)
      focus.select('circle').attr('cx', x(d.date)).attr('cy', y(d.close))
      focus.select('line').attr('x1', x(d.date)).attr('x2', x(d.date))

      const ohlc = props.mode === 'candle'
        ? `<div class="tt-row"><span>O</span><span>${d.open?.toFixed(2)}</span></div>
           <div class="tt-row"><span>H</span><span>${d.high?.toFixed(2)}</span></div>
           <div class="tt-row"><span>L</span><span>${d.low?.toFixed(2)}</span></div>
           <div class="tt-row"><span>C</span><span>${d.close?.toFixed(2)}</span></div>`
        : `<div class="tt-price">${d.close?.toFixed(2)}</div>`

      tooltip
        .style('display', 'block')
        .style('left', `${Math.min(x(d.date) + margin.left + 10, W - 130)}px`)
        .style('top', `${y(d.close) + margin.top - 10}px`)
        .html(`<div class="tt-date">${new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>${ohlc}`)
    })
    .on('mouseleave touchend', () => { focus.style('display', 'none'); tooltip.style('display', 'none') })
}

onMounted(() => nextTick(draw))
watch(() => [props.data, props.loading, props.mode, props.currentPrice], () => nextTick(draw))

const ro = new ResizeObserver(() => nextTick(draw))
onMounted(() => { if (containerRef.value) ro.observe(containerRef.value) })
onUnmounted(() => ro.disconnect())
</script>

<template>
  <div ref="containerRef" class="chart-container">
    <div v-if="loading" class="chart-loading"><i class="pi pi-spin pi-spinner" /></div>
    <div v-else-if="!data.length" class="chart-empty text-muted">No data</div>
    <template v-else>
      <svg ref="svgRef" />
      <div ref="tooltipRef" class="chart-tooltip" style="display:none;" />
    </template>
  </div>
</template>

<style scoped>
.chart-container { position: relative; width: 100%; min-height: 240px; }
.chart-loading, .chart-empty { display: flex; align-items: center; justify-content: center; height: 240px; color: var(--text-secondary); font-size: 1.5rem; }
svg { display: block; width: 100%; }
</style>

<style>
.chart-tooltip {
  position: absolute;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 10px;
  pointer-events: none;
  z-index: 10;
  font-size: 12px;
  min-width: 90px;
}
.tt-date { color: #94a3b8; margin-bottom: 4px; font-size: 11px; }
.tt-price { color: #f1f5f9; font-weight: 600; font-size: 14px; }
.tt-row { display: flex; justify-content: space-between; gap: 12px; color: #f1f5f9; font-size: 12px; }
.tt-row span:first-child { color: #94a3b8; }
</style>
