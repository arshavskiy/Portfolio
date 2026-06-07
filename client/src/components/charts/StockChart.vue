<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  mode: { type: String, default: 'line' }, // 'line' | 'candle'
  range: { type: String, default: '3mo' },
  ticker: { type: String, default: '' },
  currentPrice: { type: Number, default: null },
})

const emit = defineEmits(['selection-change'])

const svgRef = ref(null)
const tooltipRef = ref(null)
const containerRef = ref(null)
const selectedPoints = ref([])

function normalizePoint(d) {
  if (!d) return null
  return {
    date: new Date(d.date).toISOString(),
    close: d.close ?? null,
    open: d.open ?? null,
    high: d.high ?? null,
    low: d.low ?? null,
  }
}

function formatTickDate(date, intraday = false) {
  return intraday
    ? d3.timeFormat('%H:%M')(date)
    : d3.timeFormat('%b %d')(date)
}

function formatTooltipDate(date, intraday = false) {
  return intraday
    ? new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    : new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
}

const INTRADAY_MARKETS = {
  us: {
    timezone: 'America/New_York',
    sessionsByDay: {
      1: [{ start: '09:30', end: '16:00' }],
      2: [{ start: '09:30', end: '16:00' }],
      3: [{ start: '09:30', end: '16:00' }],
      4: [{ start: '09:30', end: '16:00' }],
      5: [{ start: '09:30', end: '16:00' }],
    },
  },
  israel: {
    timezone: 'Asia/Jerusalem',
    sessionsByDay: {
      1: [{ start: '10:00', end: '17:35' }],
      2: [{ start: '10:00', end: '17:35' }],
      3: [{ start: '10:00', end: '17:35' }],
      4: [{ start: '10:00', end: '17:35' }],
      5: [{ start: '10:00', end: '13:50' }],
    },
  },
  crypto: {
    timezone: 'UTC',
    sessionsByDay: {
      0: [{ start: '00:00', end: '24:00' }],
      1: [{ start: '00:00', end: '24:00' }],
      2: [{ start: '00:00', end: '24:00' }],
      3: [{ start: '00:00', end: '24:00' }],
      4: [{ start: '00:00', end: '24:00' }],
      5: [{ start: '00:00', end: '24:00' }],
      6: [{ start: '00:00', end: '24:00' }],
    },
  },
}

const SESSION_COLORS = {
  pre: '#facc15',
  marketUp: '#22c55e',
  marketDown: '#ef4444',
  post: '#a78bfa',
}

function inferIntradayMarket(ticker) {
  const symbol = (ticker || '').toUpperCase()
  if (/-USD$/.test(symbol)) return INTRADAY_MARKETS.crypto
  if (/\.TA$/.test(symbol)) return INTRADAY_MARKETS.israel
  return INTRADAY_MARKETS.us
}

function timeParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

  return {
    weekday: weekdayMap[map.weekday] ?? 0,
    hour: Number(map.hour),
    minute: Number(map.minute),
  }
}

function toMinutes(value) {
  const [hour, minute] = value.split(':').map(Number)
  return (hour * 60) + minute
}

function getSessionType(date, ticker) {
  const market = inferIntradayMarket(ticker)
  if (market === INTRADAY_MARKETS.crypto) return 'market'

  const parts = timeParts(date, market.timezone)
  const currentMinutes = (parts.hour * 60) + parts.minute
  const sessions = (market.sessionsByDay[parts.weekday] || []).map((session) => ({
    ...session,
    startMinutes: toMinutes(session.start),
    endMinutes: toMinutes(session.end),
  }))

  if (!sessions.length) return 'post'

  if (sessions.some((session) => currentMinutes >= session.startMinutes && currentMinutes < session.endMinutes)) {
    return 'market'
  }

  if (currentMinutes < sessions[0].startMinutes) return 'pre'
  return 'post'
}

function buildSessionSegments(points, ticker) {
  if (!points.length) return []

  const firstType = getSessionType(points[0].date, ticker)
  const segments = []
  let currentType = firstType
  let currentPoints = [points[0]]

  for (let i = 1; i < points.length; i += 1) {
    const point = points[i]
    const pointType = getSessionType(point.date, ticker)

    if (pointType === currentType) {
      currentPoints.push(point)
      continue
    }

    segments.push({ type: currentType, points: currentPoints })
    currentType = pointType
    currentPoints = [points[i - 1], point]
  }

  segments.push({ type: currentType, points: currentPoints })
  return segments
}

function setSelectedPoints(points) {
  selectedPoints.value = points
  emit('selection-change', points.map(normalizePoint).filter(Boolean))
}

function selectPoint(point) {
  if (!point) return

  const existingIndex = selectedPoints.value.findIndex(
    (item) => new Date(item.date).getTime() === new Date(point.date).getTime()
  )

  if (existingIndex !== -1) {
    const next = [...selectedPoints.value]
    next.splice(existingIndex, 1)
    setSelectedPoints(next)
    return
  }

  if (selectedPoints.value.length >= 2) {
    setSelectedPoints([point])
    return
  }

  setSelectedPoints([...selectedPoints.value, point].sort((a, b) => new Date(a.date) - new Date(b.date)))
}

function draw() {
  if (!svgRef.value || !props.data.length) return

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const W = containerRef.value.clientWidth
  const H = 240
  const margin = { top: 10, right: 12, bottom: 30, left: 60 }
  const w = W - margin.left - margin.right
  const baseH = H - margin.top - margin.bottom

  svg.attr('width', W).attr('height', H)
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  const parsed = props.data.map((d) => ({ ...d, date: new Date(d.date) }))
  const intraday = props.range === '1d' || (
    parsed.length > 1 &&
    (parsed[parsed.length - 1].date - parsed[0].date) <= (36 * 60 * 60 * 1000)
  )
  const showVolume = intraday && parsed.some((d) => Number.isFinite(d.volume) && d.volume > 0)
  const volumeHeight = showVolume ? 42 : 0
  const volumeGap = showVolume ? 8 : 0
  const h = baseH - volumeHeight - volumeGap
  const volumeTop = h + volumeGap
  const volumeBottom = volumeTop + volumeHeight

  const x = d3.scaleTime().domain(d3.extent(parsed, (d) => d.date)).range([0, w])
  const priceValues = parsed.flatMap((d) => {
    if (props.mode === 'candle') return [d.low, d.high]
    return [d.close]
  }).filter((value) => Number.isFinite(value))
  if (Number.isFinite(props.currentPrice)) priceValues.push(props.currentPrice)
  const yMin = d3.min(priceValues)
  const yMax = d3.max(priceValues)
  const yPad = (yMax - yMin) * 0.05 || 1
  const y = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([h, 0])
  const volumeMax = showVolume ? d3.max(parsed, (d) => d.volume || 0) || 0 : 0
  const yVolume = showVolume
    ? d3.scaleLinear().domain([0, volumeMax]).range([volumeBottom, volumeTop])
    : null

  const first = parsed[0]?.close
  const last = parsed[parsed.length - 1]?.close
  const isUp = last >= first
  const color = isUp ? '#22c55e' : '#ef4444'
  const sessionSegments = intraday ? buildSessionSegments(parsed, props.ticker) : []

  // Grid
  g.append('g')
    .call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat(''))
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line').attr('stroke', '#334155').attr('stroke-dasharray', '2,4'))

  if (showVolume) {
    g.append('line')
      .attr('x1', 0)
      .attr('x2', w)
      .attr('y1', volumeTop)
      .attr('y2', volumeTop)
      .attr('stroke', '#1f2937')
      .attr('stroke-width', 1)
  }

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

    if (intraday && sessionSegments.length) {
      sessionSegments.forEach((segment) => {
        const segmentColor = segment.type === 'pre'
          ? SESSION_COLORS.pre
          : segment.type === 'post'
            ? SESSION_COLORS.post
            : color

        g.append('path')
          .datum(segment.points)
          .attr('fill', 'none')
          .attr('stroke', segmentColor)
          .attr('stroke-width', 1.8)
          .attr('d', d3.line().x((d) => x(d.date)).y((d) => y(d.close)).curve(d3.curveMonotoneX))
      })
    } else {
      // Line
      g.append('path')
        .datum(parsed)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('d', d3.line().x((d) => x(d.date)).y((d) => y(d.close)).curve(d3.curveMonotoneX))
    }
  }

  if (showVolume) {
    const bandW = Math.max(1, (w / parsed.length) * (props.mode === 'candle' ? 0.6 : 0.7))

    g.selectAll('.volume-bar')
      .data(parsed)
      .enter().append('rect')
      .attr('class', 'volume-bar')
      .attr('x', (d) => x(d.date) - (bandW / 2))
      .attr('y', (d) => yVolume(d.volume || 0))
      .attr('width', bandW)
      .attr('height', (d) => Math.max(1, volumeBottom - yVolume(d.volume || 0)))
      .attr('rx', 1)
      .attr('fill', (d) => (d.close >= d.open ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.38)'))
  }

  // X axis
  g.append('g').attr('transform', `translate(0,${showVolume ? volumeBottom : h})`)
    .call(d3.axisBottom(x).ticks(intraday ? 8 : 5).tickFormat((d) => formatTickDate(d, intraday)))
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
  focus.append('line').attr('y1', 0).attr('y2', showVolume ? volumeBottom : h)
    .attr('stroke', '#94a3b8').attr('stroke-dasharray', '3,3').attr('stroke-width', 1)
  focus.append('circle').attr('r', 4).attr('fill', color).attr('stroke', '#0f172a').attr('stroke-width', 2)

  const selectionLayer = g.append('g')
  const renderSelections = () => {
    selectionLayer.selectAll('*').remove()

    selectedPoints.value.forEach((point, index) => {
      const cx = x(new Date(point.date))
      const cy = y(point.close)
      const stroke = index === 0 ? '#e2e8f0' : '#cbd5e1'
      const label = point.close?.toFixed(2) || '—'
      const labelWidth = Math.max(52, label.length * 7 + 16)
      const labelX = Math.min(Math.max(cx - labelWidth / 2, 0), w - labelWidth)
      const labelY = Math.min(cy + 10, h - 22)

      selectionLayer.append('line')
        .attr('x1', cx)
        .attr('x2', cx)
        .attr('y1', 0)
        .attr('y2', showVolume ? volumeBottom : h)
        .attr('stroke', stroke)
        .attr('stroke-width', 1.5)

      selectionLayer.append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 5.5)
        .attr('fill', stroke)
        .attr('stroke', '#0f172a')
        .attr('stroke-width', 2)

      selectionLayer.append('rect')
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('width', labelWidth)
        .attr('height', 18)
        .attr('rx', 9)
        .attr('fill', '#e5e7eb')
        .attr('opacity', 0.96)

      selectionLayer.append('text')
        .attr('x', labelX + labelWidth / 2)
        .attr('y', labelY + 12)
        .attr('text-anchor', 'middle')
        .attr('fill', '#0f172a')
        .attr('font-size', '10')
        .attr('font-weight', 700)
        .text(label)
    })
  }

  renderSelections()

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
      const volumeRow = showVolume
        ? `<div class="tt-row"><span>Vol</span><span>${d3.format('.3s')(d.volume || 0)}</span></div>`
        : ''

      tooltip
        .style('display', 'block')
        .style('left', `${Math.min(x(d.date) + margin.left + 10, W - 130)}px`)
        .style('top', `${y(d.close) + margin.top - 10}px`)
        .html(`<div class="tt-date">${formatTooltipDate(d.date, intraday)}</div>${ohlc}${volumeRow}`)
    })
    .on('click', (event) => {
      const [mx] = d3.pointer(event)
      const date = x.invert(mx - margin.left)
      const i = bisect(parsed, date, 1)
      const d0 = parsed[i - 1]; const d1 = parsed[i]
      if (!d0 && !d1) return
      const d = d1 && date - d0?.date > d1?.date - date ? d1 : d0
      if (!d) return
      selectPoint(d)
      renderSelections()
    })
    .on('mouseleave touchend', () => { focus.style('display', 'none'); tooltip.style('display', 'none') })
}

onMounted(() => nextTick(draw))
watch(() => [props.data, props.loading, props.mode, props.range, props.currentPrice], () => nextTick(draw))
watch(() => props.data, () => {
  setSelectedPoints([])
}, { deep: true })

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
