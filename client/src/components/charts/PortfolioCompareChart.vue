<script setup>
import {computed, nextTick, onMounted, ref, watch} from 'vue'
import * as d3 from 'd3'
import {useNavigateToPosition} from '@/composables/useNavigateToPosition'
import {useHistoryStore} from '@/stores/history'
import {usePercent} from '@/composables/useFormat'
import {useI18n} from '@/composables/useI18n'
import AppLoader from '@/components/ui/AppLoader.vue'

const props = defineProps({
  positions: {type: Array, default: () => []},
  range: {type: String, default: '1mo'}, // dashboard history range (e.g. '1mo', '1wk')
})

const {openPosition} = useNavigateToPosition()
const historyStore = useHistoryStore()
const {t} = useI18n()
const svgRef = ref(null)
const wrapRef = ref(null)
const loading = ref(false)
const series = ref({}) // ticker -> [{ date, close }]

// Same categorical palette used for allocation slices, so a ticker's color
// stays consistent across the dashboard.
const COLORS = ['#3b82f6', '#00ff88', '#f59e0b', '#ff3366', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

// The dashboard's own range vocabulary (includes 1wk/all) doesn't map 1:1 to
// the per-stock history endpoint's — translate to the closest equivalent.
const STOCK_RANGE = {'1d': '1d', '1wk': '5d', '1mo': '1mo', '3mo': '3mo', '6mo': '6mo', '1y': '1y', all: '5y'}

const tickers = computed(() => [...new Set(props.positions.map((p) => p.ticker))])
const positionByTicker = computed(() => {
  return Object.fromEntries(props.positions.map((p) => [p.ticker, p]))
})

function stockName(ticker) {
  const position = positionByTicker.value[ticker]
  return position?.companyName || position?.name || ticker
}

const colorFor = (ticker) => {
  const i = tickers.value.indexOf(ticker)
  return COLORS[i % COLORS.length]
}

// Normalize each ticker's series to % change from its first point so
// differently-priced/sized holdings are visually comparable on one chart.
const normalized = computed(() => {
  return tickers.value
      .map((ticker) => {
        const rows = (series.value[ticker] || []).filter((r) => r.close != null)
        if (!rows.length) return null
        const base = rows[0].close
        if (!base) return null
        return {
          ticker,
          color: colorFor(ticker),
          points: rows.map((r) => ({date: r.date, pct: ((r.close - base) / base) * 100})),
        }
      })
      .filter(Boolean)
})

const legend = computed(() =>
    normalized.value.map((s) => ({
      ticker: s.ticker,
      name: stockName(s.ticker),
      color: s.color,
      pct: s.points[s.points.length - 1]?.pct ?? 0,
    }))
)

async function fetchSeries() {
  loading.value = true
  const stockRange = STOCK_RANGE[props.range] || '1mo'
  try {
    const entries = await Promise.all(tickers.value.map(async (ticker) => {
      try {
        return [ticker, await historyStore.fetchHistory(ticker, stockRange, 40)]
      } catch {
        return [ticker, []]
      }
    }))
    series.value = Object.fromEntries(entries)
  } finally {
    loading.value = false
  }
}

function draw() {
  if (!svgRef.value || !wrapRef.value || !normalized.value.length) return
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const W = wrapRef.value.clientWidth || 320
  const H = 160
  svg.attr('width', W).attr('height', H)

  const allPoints = normalized.value.flatMap((s) => s.points)
  // Use actual dates for x, not array index — different tickers (e.g. crypto
  // trading 7 days/week vs. equities) don't have the same point count, so
  // indexing by position misaligns/squishes shorter series and makes lines
  // look like they're running backwards.
  const x = d3.scaleTime()
      .domain(d3.extent(allPoints, (d) => new Date(d.date)))
      .range([0, W])
  const yMin = d3.min(allPoints, (d) => d.pct)
  const yMax = d3.max(allPoints, (d) => d.pct)
  const yPad = (yMax - yMin) * 0.1 || 1
  const y = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([H - 4, 4])

  // Zero baseline (the "start of range" reference)
  svg.append('line')
      .attr('x1', 0).attr('x2', W)
      .attr('y1', y(0)).attr('y2', y(0))
      .attr('stroke', '#64748b')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3 3')
      .attr('opacity', 0.5)

  const line = d3.line()
      .x((d) => x(new Date(d.date)))
      .y((d) => y(d.pct))
      .curve(d3.curveMonotoneX)

  normalized.value.forEach((s) => {
    svg.append('path')
        .datum(s.points)
        .attr('fill', 'none')
        .attr('stroke', s.color)
        .attr('stroke-width', 1.5)
        .attr('d', line)
        .style('cursor', 'pointer')
        .on('click', () => openPosition(s.ticker))
  })
}

let ro
onMounted(async () => {
  await fetchSeries()
  nextTick(draw)
  ro = new ResizeObserver(() => draw())
  if (wrapRef.value) ro.observe(wrapRef.value)
})
watch(() => props.range, fetchSeries)
watch(() => props.positions.map((p) => p.ticker).join(','), fetchSeries)
watch(series, () => nextTick(draw), {deep: true})
</script>

<template>
  <section v-if="positions.length" class="compare-card">
    <h2 class="card-title">{{ t('dashboard.stockPerformance') }}</h2>

    <div ref="wrapRef" class="compare-wrap">
      <div v-if="loading && !normalized.length" class="compare-state">
        <AppLoader/>
      </div>
      <div v-else-if="!normalized.length" class="compare-state">{{ t('dashboard.notEnoughHistory') }}</div>
      <svg v-else ref="svgRef" class="compare-svg"/>
    </div>

    <div class="legend">
      <button
          v-for="item in legend"
          :key="item.ticker"
          class="legend-item"
          @click="openPosition(item.ticker)"
      >
        <span :style="{ background: item.color }" class="legend-dot"/>
        <span class="legend-name" :title="`${item.name} · ${item.ticker}`">{{ item.name }}</span>
        <span class="legend-symbol text-muted">{{ item.ticker }}</span>
        <span :class="item.pct >= 0 ? 'up' : 'down'" class="legend-pct">{{ usePercent(item.pct) }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.compare-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  margin-bottom: 0.75rem;
}

.card-title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0 0 0.75rem;
}

.compare-wrap {
  width: 100%;
}

.compare-svg {
  display: block;
  width: 100%;
  height: 160px;
}

.compare-state {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.75rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 10px;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: border-color 0.15s;
}

.legend-item:active {
  border-color: var(--accent);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-name {
  font-size: 0.72rem;
  font-weight: 700;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-symbol {
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
}

.legend-pct {
  font-size: 0.78rem;
  font-weight: 600;
}

.legend-pct.up {
  color: var(--neon-green);
}

.legend-pct.down {
  color: var(--neon-red);
}
</style>
