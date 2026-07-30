<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'
import {useI18n} from '@/composables/useI18n'
import AppLoader from '@/components/ui/AppLoader.vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  markerPoints: { type: Array, default: () => [] },
  transactionMarkers: { type: Array, default: () => [] }, // [{date, type: 'buy'|'sell', shares, price}]
  mode: { type: String, default: 'line' }, // 'line' | 'candle'
  range: { type: String, default: '3mo' },
  ticker: { type: String, default: '' },
  currentPrice: { type: Number, default: null },
})
const {t} = useI18n()

const emit = defineEmits(['selection-change'])

const svgRef = ref(null)
const containerRef = ref(null)
const selectedPoints = ref([])
const hasSelections = computed(() => selectedPoints.value.length > 0)
const draggingSelection = ref(false)
const suppressClickUntil = ref(0)
const dragPreview = ref(null)
const dragStartPoints = ref([])
const dragPreviewPill = ref(null)

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

function buildIntradayTickValues(x, sessionSegments) {
  const sessionTicks = sessionSegments
    .filter((segment) => segment.type === 'market' && segment.points.length)
    .flatMap((segment) => [
      segment.points[0].date,
      segment.points[segment.points.length - 1].date,
    ])

  const values = sessionTicks.length ? sessionTicks : x.ticks(2)

  return values
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => a - b)
    .filter((value, index, arr) => index === 0 || value.getTime() !== arr[index - 1].getTime())
}

function setSelectedPoints(points) {
  selectedPoints.value = points
  emit('selection-change', points.map(normalizePoint).filter(Boolean))
}

function clearSelectedPoints() {
  dragPreview.value = null
  dragStartPoints.value = []
  dragPreviewPill.value = null
  setSelectedPoints([])
  nextTick(draw)
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

function layoutRightSideBadges(badges, h) {
  if (!badges.length) return []

  const minGap = 4
  const sorted = badges
    .map((badge) => ({
      ...badge,
      y: Math.min(Math.max(0, badge.y), h - badge.height),
    }))
    .sort((a, b) => a.y - b.y)

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]
    const current = sorted[i]
    const minY = prev.y + prev.height + minGap
    if (current.y < minY) current.y = minY
  }

  for (let i = sorted.length - 2; i >= 0; i -= 1) {
    const next = sorted[i + 1]
    const current = sorted[i]
    const maxY = next.y - current.height - minGap
    if (current.y > maxY) current.y = maxY
    current.y = Math.max(0, current.y)
  }

  return sorted
}

function pickNearestPoint(mx, parsed, x, bisect, marginLeft) {
  const date = x.invert(mx - marginLeft)
  const i = bisect(parsed, date, 1)
  const d0 = parsed[i - 1]
  const d1 = parsed[i]
  if (!d0 && !d1) return null
  return d1 && date - d0?.date > d1?.date - date ? d1 : d0
}

function eventClientX(eventLike) {
  if (!eventLike) return null
  if (Number.isFinite(eventLike.clientX)) return eventLike.clientX
  if (eventLike.touches?.length && Number.isFinite(eventLike.touches[0]?.clientX)) return eventLike.touches[0].clientX
  if (eventLike.changedTouches?.length && Number.isFinite(eventLike.changedTouches[0]?.clientX)) return eventLike.changedTouches[0].clientX
  return null
}

function localPointerX(eventLike, element) {
  const clientX = eventClientX(eventLike)
  const bounds = element?.getBoundingClientRect?.()
  if (clientX == null || !bounds) return null
  const x = clientX - bounds.left
  return Number.isFinite(x) ? x : null
}

function draw() {
  if (!svgRef.value || !props.data.length) return

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const W = containerRef.value.clientWidth
  const H = 240
  const margin = { top: 10, right: 12, bottom: 30, left: 12 }
  const w = W - margin.left - margin.right
  const baseH = H - margin.top - margin.bottom

  svg.attr('width', W).attr('height', H)
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  const parsed = props.data.map((d) => ({ ...d, date: new Date(d.date) }))
  const intraday = props.range === '1d' || (
    parsed.length > 1 &&
    (parsed[parsed.length - 1].date - parsed[0].date) <= (36 * 60 * 60 * 1000)
  )
  // 5d uses sub-daily bars spanning multiple days — index scale collapses overnight gaps.
  // 1d also uses index scale: pre/post-market bars would otherwise squish the regular
  // session to the left when the time domain extends to 20:00+ ET.
  const useIndexScale = (intraday && props.range === '1d') || (
    !intraday && props.range === '5d' && parsed.length > 1 &&
    (parsed[parsed.length - 1].date - parsed[0].date) <= (8 * 24 * 60 * 60 * 1000)
  )
  const multiDayIntraday = useIndexScale && props.range === '5d'

  const showVolume = intraday && parsed.some((d) => Number.isFinite(d.volume) && d.volume > 0)
  const volumeHeight = showVolume ? 42 : 0
  const volumeGap = showVolume ? 8 : 0
  const h = baseH - volumeHeight - volumeGap
  const volumeTop = h + volumeGap
  const volumeBottom = volumeTop + volumeHeight

  // For 1d: map bars to time-proportional positions within the full trading day
  // window (pre-market open → after-hours close). This lets the line grow
  // rightward as new bars arrive instead of always stretching to fill the width.
  // For 5d: keep simple sequential index scale to collapse overnight gaps.
  let xByIndex = null
  let indexMap = null
  if (useIndexScale) {
    if (props.range === '1d' && parsed.length) {
      const market = inferIntradayMarket(props.ticker)
      const firstDate = parsed[0].date
      const parts = timeParts(firstDate, market.timezone)
      const sessions = (market.sessionsByDay[parts.weekday] || []).map((s) => ({
        startMinutes: toMinutes(s.start),
        endMinutes: toMinutes(s.end),
      }))
      // Full day window: pre-market (4:00 ET) → after-hours close (20:00 ET).
      // If real bars run past the nominal close (late after-hours prints), extend the
      // window to the last bar so they don't pile up clamped on the rightmost slot.
      const DAY_START_MINUTES = market === INTRADAY_MARKETS.israel
        ? (sessions[0]?.startMinutes ?? toMinutes('10:00')) - 30
        : toMinutes('04:00')
      const NOMINAL_END_MINUTES = market === INTRADAY_MARKETS.israel
        ? (sessions[0]?.endMinutes ?? toMinutes('17:35')) + 30
        : toMinutes('20:00')
      const lastBarMinutes = parsed.reduce((max, d) => {
        const p = timeParts(d.date, market.timezone)
        return Math.max(max, p.hour * 60 + p.minute)
      }, 0)
      const DAY_END_MINUTES = Math.max(NOMINAL_END_MINUTES, lastBarMinutes)
      const INTERVAL = 2
      const totalBars = Math.ceil((DAY_END_MINUTES - DAY_START_MINUTES) / INTERVAL) + 1

      indexMap = new Map(parsed.map((d) => {
        const p = timeParts(d.date, market.timezone)
        const mins = p.hour * 60 + p.minute
        const idx = Math.round((mins - DAY_START_MINUTES) / INTERVAL)
        return [d, Math.max(0, Math.min(idx, totalBars - 1))]
      }))
      xByIndex = d3.scaleLinear().domain([0, totalBars - 1]).range([0, w])
    } else {
      indexMap = new Map(parsed.map((d, i) => [d, i]))
      xByIndex = d3.scaleLinear().domain([0, Math.max(1, parsed.length - 1)]).range([0, w])
    }
  }
  const x = useIndexScale ? null : d3.scaleTime().domain(d3.extent(parsed, (d) => d.date)).range([0, w])

  // Date-keyed slot lookup so points that aren't the original parsed object
  // reference (e.g. selection markers stored in a Vue ref) still resolve their
  // index instead of falling back to slot 0 (the left edge).
  const indexByTime = useIndexScale
    ? new Map(parsed.map((d) => [d.date.getTime(), indexMap.get(d) ?? 0]))
    : null

  function slotOf(d) {
    const direct = indexMap.get(d)
    if (direct != null) return direct
    return indexByTime.get(new Date(d.date).getTime()) ?? 0
  }

  function xPos(d) {
    if (useIndexScale) return xByIndex(slotOf(d))
    return x(d.date)
  }

  function xPosFromDate(date) {
    if (useIndexScale) {
      const t = date.getTime()
      const idx = parsed.findIndex(d => d.date.getTime() === t)
      return idx >= 0 ? xByIndex(indexMap.get(parsed[idx]) ?? 0) : 0
    }
    return x(date)
  }

  function resolveMarkerPoint(point) {
    if (!point?.date) return null
    const time = new Date(point.date).getTime()
    const matched = parsed.find((d) => d.date.getTime() === time)
    if (!matched || !Number.isFinite(matched.close)) return null
    return {
      ...matched,
      markerLabel: point.label,
      markerTone: point.tone,
    }
  }

  function xInvert(px) {
    if (useIndexScale) {
      let closest = parsed[0]
      let minDist = Infinity
      parsed.forEach((d) => {
        const dist = Math.abs(xByIndex(indexMap.get(d) ?? 0) - px)
        if (dist < minDist) { minDist = dist; closest = d }
      })
      return closest
    }
    return null
  }
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
  const marketBoundaryTicks = sessionSegments
    .filter((segment) => segment.type === 'market' && segment.points.length)
    .flatMap((segment) => [
      segment.points[0].date.getTime(),
      segment.points[segment.points.length - 1].date.getTime(),
    ])
  const xTickValues = (intraday && !useIndexScale) ? buildIntradayTickValues(x, sessionSegments) : null

  // For 5d index scale: pick one tick per trading day (first bar of each day)
  const multiDayTickData = multiDayIntraday ? (() => {
    const seen = new Set()
    return parsed
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => {
        const day = d.date.toDateString()
        if (seen.has(day)) return false
        seen.add(day)
        return true
      })
  })() : null

  // For 1d index scale: tick at session open and close boundaries
  const intradayIndexTickData = (useIndexScale && props.range === '1d') ? (() => {
    const ticks = []
    for (const seg of sessionSegments) {
      if (seg.type === 'market' && seg.points.length) {
        const first = seg.points[0]
        const last = seg.points[seg.points.length - 1]
        ticks.push({ d: first, i: indexMap.get(first) ?? 0, boundary: true })
        if (last !== first) ticks.push({ d: last, i: indexMap.get(last) ?? parsed.length - 1, boundary: true })
      }
    }
    // Add a few evenly spaced labels inside the session using time-proportional indices
    const allMarket = parsed
      .map((d) => ({ d, i: indexMap.get(d) ?? 0 }))
      .filter(({ d }) => getSessionType(d.date, props.ticker) === 'market')
    const step = Math.floor(allMarket.length / 3)
    if (step > 0) {
      for (let k = step; k < allMarket.length - step / 2; k += step) {
        ticks.push({ ...allMarket[k], boundary: false })
      }
    }
    const sorted = ticks.sort((a, b) => a.i - b.i)
    // Remove ticks whose pixel positions are within 40px of each other.
    // Boundary ticks (open/close) take priority since they were added first.
    // Use xByIndex to convert slot index → pixel (accounts for time-proportional scale).
    const kept = []
    for (const tick of sorted) {
      const px = xByIndex(tick.i)
      const tooClose = kept.some(k => Math.abs(xByIndex(k.i) - px) < 40)
      if (!tooClose) kept.push(tick)
    }
    return kept
  })() : null

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

  // Bar width: use the median pixel gap between consecutive rendered bars,
  // not width / count. On a time scale, weekday clustering (weekend gaps)
  // means the average gap (w / count) understates the real local spacing —
  // bars end up thin and the chart reads as sparse even though every trading
  // day in range is present. Same fix already applied to the index scale
  // (data points can sit several slots apart there) — generalized here to
  // any scale so every range benefits, not just 1d/5d.
  const slotPx = (() => {
    if (parsed.length <= 1) return null
    const xs = parsed.map((d) => xPos(d)).sort((a, b) => a - b)
    const gaps = []
    for (let i = 1; i < xs.length; i += 1) {
      const g = xs[i] - xs[i - 1]
      if (g > 0) gaps.push(g)
    }
    if (!gaps.length) return null
    gaps.sort((a, b) => a - b)
    return Math.max(2, gaps[Math.floor(gaps.length / 2)])
  })()

  if (props.mode === 'candle') {
    const bandW = slotPx != null
      ? Math.max(2, slotPx * 0.85)
      : Math.max(1, (w / parsed.length) * 0.6)

    // Wicks
    g.selectAll('.wick')
      .data(parsed)
      .enter().append('line')
      .attr('x1', (d) => xPos(d))
      .attr('x2', (d) => xPos(d))
      .attr('y1', (d) => y(d.high))
      .attr('y2', (d) => y(d.low))
      .attr('stroke', (d) => d.close >= d.open ? '#22c55e' : '#ef4444')
      .attr('stroke-width', 1)

    // Bodies
    g.selectAll('.candle')
      .data(parsed)
      .enter().append('rect')
      .attr('x', (d) => xPos(d) - bandW / 2)
      .attr('y', (d) => y(Math.max(d.open, d.close)))
      .attr('width', bandW)
      .attr('height', (d) => Math.max(1, Math.abs(y(d.open) - y(d.close))))
      .attr('fill', (d) => d.close >= d.open ? '#22c55e' : '#ef4444')

  } else {
    if (intraday && sessionSegments.length) {
      sessionSegments.forEach((segment) => {
        const segmentColor = segment.type === 'pre'
          ? SESSION_COLORS.pre
          : segment.type === 'post'
            ? SESSION_COLORS.post
            : color

        g.append('path')
          .datum(segment.points)
          .attr('fill', d3.color(segmentColor).copy({ opacity: 0.16 }))
          .attr('d', d3.area().x((d) => xPos(d)).y0(h).y1((d) => y(d.close)).curve(d3.curveMonotoneX))
      })
    } else {
      g.append('path')
        .datum(parsed)
        .attr('fill', isUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)')
        .attr('d', d3.area().x((d) => xPos(d)).y0(h).y1((d) => y(d.close)).curve(d3.curveMonotoneX))
    }

    // Line — per-segment coloring for pre/post market on 1d
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
          .attr('stroke-width', 1.5)
          .attr('d', d3.line().x((d) => xPos(d)).y((d) => y(d.close)).curve(d3.curveMonotoneX))
      })
    } else {
      g.append('path')
        .datum(parsed)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('d', d3.line().x((d) => xPos(d)).y((d) => y(d.close)).curve(d3.curveMonotoneX))
    }
  }

  if (showVolume) {
    const bandW = useIndexScale && slotPx != null
      ? Math.max(2, slotPx * 0.85)
      : Math.max(1, (w / parsed.length) * (props.mode === 'candle' ? 0.6 : 0.7))

    g.selectAll('.volume-bar')
      .data(parsed)
      .enter().append('rect')
      .attr('class', 'volume-bar')
      .attr('x', (d) => xPos(d) - (bandW / 2))
      .attr('y', (d) => yVolume(d.volume || 0))
      .attr('width', bandW)
      .attr('height', (d) => Math.max(1, volumeBottom - yVolume(d.volume || 0)))
      .attr('rx', 1)
      .attr('fill', (d) => (d.close >= d.open ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.38)'))
  }

  // X axis
  const xAxisG = g.append('g').attr('transform', `translate(0,${showVolume ? volumeBottom : h})`)
  if (multiDayIntraday && multiDayTickData) {
    // Manually place one label per trading day, evenly spaced by index
    xAxisG.selectAll('text')
      .data(multiDayTickData)
      .enter().append('text')
      .attr('x', ({ i }) => xByIndex(i))
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10')
      .text(({ d }) => d3.timeFormat('%b %d')(d.date))
  } else if (intradayIndexTickData) {
    // 1d index scale: place HH:MM labels at session open/close + a few interior points
    xAxisG.selectAll('text')
      .data(intradayIndexTickData)
      .enter().append('text')
      .attr('x', ({ i }) => xByIndex(i))
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .attr('fill', ({ boundary }) => boundary ? '#e2e8f0' : '#94a3b8')
      .attr('font-size', ({ boundary }) => boundary ? '11' : '10')
      .attr('font-weight', ({ boundary }) => boundary ? 700 : 400)
      .text(({ d }) => d3.timeFormat('%H:%M')(d.date))
  } else {
    xAxisG.call(
      d3.axisBottom(x)
        .tickValues(xTickValues)
        .ticks(intraday ? 8 : 5)
        .tickFormat((d) => formatTickDate(d, intraday))
    )
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line').remove())
    .call((g) => g.selectAll('text')
      .attr('fill', (d) => marketBoundaryTicks.includes(new Date(d).getTime()) ? '#e2e8f0' : '#94a3b8')
      .attr('font-size', (d) => marketBoundaryTicks.includes(new Date(d).getTime()) ? '11' : '10')
      .attr('font-weight', (d) => marketBoundaryTicks.includes(new Date(d).getTime()) ? 700 : 400))
  }

  // Y axis
  g.append('g')
    .call(d3.axisLeft(y).ticks(4).tickFormat(''))
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line').remove())
    .call((g) => g.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '10'))

  const rightSideBadges = []

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
      rightSideBadges.push({
        key: 'current-price',
        text: props.currentPrice.toFixed(2),
        width: labelWidth,
        height: labelHeight,
        y: priceY - labelHeight / 2,
        fill: '#0f172a',
        stroke: '#f59e0b',
        strokeWidth: 1,
        textFill: '#f8fafc',
        fontSize: '10',
        fontWeight: 600,
        rx: 4,
      })
    }
  }

  const closePoints = parsed.filter((d) => Number.isFinite(d.close))
  const maxPoint = closePoints.length
    ? closePoints.reduce((best, point) => (point.close > best.close ? point : best), closePoints[0])
    : null
  const minPoint = closePoints.length
    ? closePoints.reduce((best, point) => (point.close < best.close ? point : best), closePoints[0])
    : null

  ;[
    { key: 'max', point: maxPoint },
    { key: 'min', point: minPoint },
  ].forEach(({ key, point }) => {
    const value = point?.close
    if (!Number.isFinite(value)) return

    const valueLabel = value.toFixed(2)
    rightSideBadges.push({
      key: `edge-${key}`,
      text: valueLabel,
      width: Math.max(50, valueLabel.length * 6.4 + 10),
      height: 13,
      y: y(value) - 7.5,
      fill: '#0f172a',
      stroke: '#475569',
      strokeWidth: 1,
      textFill: '#f8fafc',
      fontSize: '8.5',
      fontWeight: 700,
      rx: 6,
      opacity: 0.96,
    })
  })

  layoutRightSideBadges(rightSideBadges, h).forEach((badge) => {
    const labelX = w - badge.width

    g.append('rect')
      .attr('x', labelX)
      .attr('y', badge.y)
      .attr('width', badge.width)
      .attr('height', badge.height)
      .attr('rx', badge.rx)
      .attr('fill', badge.fill)
      .attr('stroke', badge.stroke)
      .attr('stroke-width', badge.strokeWidth)
      .attr('opacity', badge.opacity ?? 1)

    g.append('text')
      .attr('x', labelX + badge.width / 2)
      .attr('y', badge.y + (badge.height >= 18 ? 12 : 9))
      .attr('text-anchor', 'middle')
      .attr('fill', badge.textFill)
      .attr('font-size', badge.fontSize)
      .attr('font-weight', badge.fontWeight)
      .text(badge.text)
  })

  const markerLayer = g.append('g')
  props.markerPoints
    .map(resolveMarkerPoint)
    .filter(Boolean)
    .forEach((point) => {
      const cx = xPos(point)
      const cy = y(point.close)
      const isHigh = point.markerTone === 'high'
      const stroke = isHigh ? '#f59e0b' : '#38bdf8'
      const fill = '#0f172a'

      markerLayer.append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 4.5)
        .attr('fill', fill)
        .attr('stroke', stroke)
        .attr('stroke-width', 2)
    })

  // Buy/sell transaction markers — snapped to the nearest loaded bar since a
  // transaction's exact timestamp rarely lines up with a bar's own date.
  // Skipped entirely when a transaction has no date (nothing to place it at).
  if (props.transactionMarkers?.length && parsed.length) {
    const txLayer = g.append('g')
    const txDateFmt = d3.timeFormat('%b %-d')
    const txTitleFmt = d3.timeFormat('%b %-d, %Y')
    props.transactionMarkers.forEach((tx, i) => {
      if (!tx?.date) return
      const txTime = new Date(tx.date).getTime()
      if (!Number.isFinite(txTime)) return
      if (txTime < parsed[0].date.getTime()) return
      let nearest = parsed[0]
      let minDist = Math.abs(parsed[0].date.getTime() - txTime)
      for (const d of parsed) {
        const dist = Math.abs(d.date.getTime() - txTime)
        if (dist < minDist) { minDist = dist; nearest = d }
      }
      if (!Number.isFinite(nearest.close)) return

      const cx = xPos(nearest)
      const cy = y(nearest.close)
      const isBuy = tx.type === 'buy'
      const stroke = '#fff'
      const fill = isBuy ? '#22c55e' : '#ef4444'
      // Alternate label above/below the marker so consecutive transactions
      // near the same price don't overlap each other's text.
      const labelUp = i % 2 === 0
      const labelY = labelUp ? cy - 10 : cy + 18

      const marker = txLayer.append('g').style('cursor', 'default')
      marker.append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 5)
          .attr('fill', fill)
        .attr('stroke', stroke)
        .attr('stroke-width', 2)
      const priceStr = tx.price != null ? ` · $${tx.price}` : ''
      const labelText = `${isBuy ? 'Buy' : 'Sell'} · ${txDateFmt(new Date(tx.date))}${priceStr}`
      const pillW = labelText.length * 6
      const pillH = 14
      const pillX = cx - pillW / 2
      const pillY = labelUp ? cy - 10 - pillH : cy + 6
      marker.append('rect')
        .attr('x', pillX).attr('y', pillY)
        .attr('width', pillW).attr('height', pillH)
        .attr('rx', 4).attr('ry', 4)
        .attr('fill', '#ffffff').attr('stroke', '#000000').attr('stroke-width', 1)
      marker.append('text')
        .attr('x', cx)
        .attr('y', pillY + pillH - 3)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .attr('font-weight', '700')
        .attr('fill', '#000000')
        .text(labelText)
      marker.append('title')
        .text(
          `${isBuy ? 'Buy' : 'Sell'} · ${txTitleFmt(new Date(tx.date))}` +
          (tx.shares != null ? ` · ${tx.shares} sh` : '') +
          (tx.price != null ? ` @ $${tx.price}` : '')
        )
    })
  }

  // Crosshair + selection
  const bisect = d3.bisector((d) => d.date).left

  function nearestPoint(mx) {
    const localX = mx - margin.left
    if (useIndexScale) return xInvert(localX)
    return pickNearestPoint(mx, parsed, x, bisect, margin.left)
  }

  const interactionRect = svg.append('rect')
    .attr('width', W).attr('height', H).attr('fill', 'none').attr('pointer-events', 'all')
    .on('mousemove touchmove', (event) => {
      if (draggingSelection.value) return
      const mx = localPointerX(event, svgRef.value)
      if (!Number.isFinite(mx)) return
      const d = nearestPoint(mx)
      if (!d) return
      showFocusAt(d)
    })
    .on('click', (event) => {
      if (draggingSelection.value || Date.now() < suppressClickUntil.value) return
      const mx = localPointerX(event, svgRef.value)
      if (!Number.isFinite(mx)) return
      const d = nearestPoint(mx)
      if (!d) return
      selectPoint(d)
      renderSelections()
    })
    .on('mouseleave touchend', () => {
      focus.style('display', 'none')
      if (!draggingSelection.value) dragPreviewPill.value = null
    })

  const focus = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`).style('display', 'none')
  focus.append('line').attr('y1', 0).attr('y2', showVolume ? volumeBottom : h)
    .attr('stroke', '#94a3b8').attr('stroke-dasharray', '3,3').attr('stroke-width', 1)
  focus.append('circle').attr('r', 4).attr('fill', color).attr('stroke', '#0f172a').attr('stroke-width', 2)
  function showFocusAt(point, showValue = false) {
    const cx = xPos(point)
    const cy = y(point.close)
    focus.raise()
    focus.style('display', null)
    focus.select('circle').attr('cx', cx).attr('cy', cy)
    focus.select('line').attr('x1', cx).attr('x2', cx)
    dragPreviewPill.value = showValue ? {
      left: margin.left + cx,
      top: margin.top + Math.max(2, cy - 22),
      text: point.close?.toFixed(2) || '—',
    } : null
  }

  const selectionLayer = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
  function selectionDrag(index, point) {
    return d3.drag()
      .on('start', () => {
        draggingSelection.value = true
        dragStartPoints.value = [...selectedPoints.value]
        dragPreview.value = {index, point}
        showFocusAt(point, false)
      })
      .on('drag', (event) => {
        const source = event?.sourceEvent ?? event
        const localX = localPointerX(source, svgRef.value) ?? event?.x
        const draggedPoint = Number.isFinite(localX)
          ? nearestPoint(localX)
          : null
        if (!draggedPoint) return

        dragPreview.value = {index, point: draggedPoint}

        // Emit a live preview so the parent's delta readout updates mid-drag
        // (without committing to selectedPoints, which would resort/redraw).
        const base = dragStartPoints.value.length ? [...dragStartPoints.value] : [...selectedPoints.value]
        base[index] = draggedPoint
        emit('selection-change', base
          .map(normalizePoint)
            .filter(Boolean)
            .sort((a, b) => new Date(a.date) - new Date(b.date)))
        renderSelections()
        showFocusAt(draggedPoint, false)
      })
      .on('end', () => {
        if (dragPreview.value?.point) {
          const next = dragStartPoints.value.length
              ? [...dragStartPoints.value]
              : [...selectedPoints.value]
          next[index] = dragPreview.value.point
          setSelectedPoints(next.sort((a, b) => new Date(a.date) - new Date(b.date)))
          nextTick(draw)
        }
        dragPreview.value = null
        dragStartPoints.value = []
        dragPreviewPill.value = null
        suppressClickUntil.value = Date.now() + 250
        draggingSelection.value = false
        focus.style('display', 'none')
      })
  }

  const renderSelections = () => {
    selectionLayer.selectAll('*').remove()

    const visiblePoints = (() => {
      const points = dragStartPoints.value.length ? [...dragStartPoints.value] : [...selectedPoints.value]
      if (dragPreview.value?.point) points[dragPreview.value.index] = dragPreview.value.point
      return points.filter(Boolean)
    })()

    visiblePoints.forEach((point, index) => {
      const cx = xPos(point)
      const cy = y(point.close)
      const stroke = index === 0 ? '#e2e8f0' : '#cbd5e1'
      const label = point.close?.toFixed(2) || '—'
      const labelWidth = Math.max(42, label.length * 6 + 10)
      const labelHeight = 15
      const desiredLabelX = index === 0 ? cx - labelWidth - 8 : cx + 8
      const labelX = Math.min(Math.max(desiredLabelX, 0), w - labelWidth)
      const labelY = Math.min(Math.max(cy - labelHeight - 8, 4), h - labelHeight - 4)

      const dragBehavior = selectionDrag(index, point)

      selectionLayer.append('rect')
        .attr('class', 'selection-hit-area')
        .attr('x', Math.max(0, cx - 12))
        .attr('y', 0)
        .attr('width', Math.min(24, w - Math.max(0, cx - 12)))
        .attr('height', showVolume ? volumeBottom : h)
        .attr('fill', 'transparent')
        .style('cursor', 'ew-resize')
        .call(dragBehavior)

      selectionLayer.append('line')
        .attr('x1', cx)
        .attr('x2', cx)
        .attr('y1', 0)
        .attr('y2', showVolume ? volumeBottom : h)
        .attr('stroke', stroke)
        .attr('stroke-width', 1.5)
        .style('cursor', 'ew-resize')
        .call(dragBehavior)

      selectionLayer.append('circle')
        .attr('class', 'selection-handle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 5.5)
        .attr('fill', stroke)
        .attr('stroke', '#0f172a')
        .attr('stroke-width', 2)
        .style('cursor', 'ew-resize')
        .call(dragBehavior)

      selectionLayer.append('rect')
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('width', labelWidth)
        .attr('height', labelHeight)
        .attr('rx', 7)
        .attr('fill', '#e5e7eb')
        .attr('opacity', 0.94)
        .style('cursor', 'ew-resize')
        .call(dragBehavior)

      selectionLayer.append('text')
        .attr('x', labelX + labelWidth / 2)
        .attr('y', labelY + 10)
        .attr('text-anchor', 'middle')
        .attr('fill', '#0f172a')
        .attr('font-size', '9')
        .attr('font-weight', 700)
        .style('cursor', 'ew-resize')
        .style('user-select', 'none')
        .text(label)
        .call(dragBehavior)
    })

  }

  renderSelections()
}

onMounted(() => nextTick(draw))
watch(() => [props.data, props.loading, props.markerPoints, props.transactionMarkers, props.mode, props.range, props.currentPrice], () => nextTick(draw))
watch(() => props.data, () => {
  dragPreview.value = null
  dragStartPoints.value = []
  dragPreviewPill.value = null
  setSelectedPoints([])
}, { deep: true })

const ro = new ResizeObserver(() => nextTick(draw))
onMounted(() => { if (containerRef.value) ro.observe(containerRef.value) })
onUnmounted(() => ro.disconnect())
</script>

<template>
  <div ref="containerRef" class="chart-container">
    <button
      v-if="hasSelections"
      class="clear-selection"
      type="button"
      @click="clearSelectedPoints"
    >Clear
    </button>
    <div
      v-if="dragPreviewPill"
      class="drag-preview-pill"
      :style="{ left: `${dragPreviewPill.left}px`, top: `${dragPreviewPill.top}px` }"
    >{{ dragPreviewPill.text }}</div>
    <div v-if="loading" class="chart-loading">
      <AppLoader/>
    </div>
    <div v-else-if="!data.length" class="chart-empty text-muted">{{ t('dashboard.noData') }}</div>
    <template v-else>
      <svg ref="svgRef" />
    </template>
  </div>
</template>

<style scoped>
.chart-container { position: relative; width: 100%; min-height: 240px; }
.chart-loading, .chart-empty { display: flex; align-items: center; justify-content: center; height: 240px; color: var(--text-secondary); font-size: 1.5rem; }
svg { display: block; width: 100%; }
.clear-selection {
  position: absolute;
  top: 0.35rem;
  left: 0.35rem;
  z-index: 2;
  border: 1px solid var(--border);
  background: rgba(15, 23, 42, 0.92);
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
}
.clear-selection:hover {
  color: var(--text-primary);
  border-color: #475569;
}
.drag-preview-pill {
  position: absolute;
  z-index: 3;
  transform: translateX(-50%);
  min-width: 52px;
  height: 16px;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: #0f172a;
  border: 1px solid #94a3b8;
  color: #f8fafc;
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  pointer-events: none;
}
</style>
