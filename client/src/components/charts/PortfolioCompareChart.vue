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
  embedded: {type: Boolean, default: false},
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
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
const COLORS = ['#3b82f6', cssVar('--green'), '#f59e0b', cssVar('--red'), '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

// The dashboard's own range vocabulary (includes 1wk/all) doesn't map 1:1 to
// the per-stock history endpoint's — translate to the closest equivalent.
const STOCK_RANGE = {
  '1d': '1d',
  '1wk': '5d',
  '1mo': '1mo',
  '3mo': '3mo',
  '6mo': '6mo',
  ytd: '1y',
  '1y': '1y',
  '2y': '5y',
  all: '5y',
}

// Index benchmarks the user can overlay for context. Toggles persist per device.
const BENCHMARKS = [
  {symbol: '^GSPC', label: 'S&P 500', color: '#64748b'},
  {symbol: '^TA125.TA', label: 'TA-125', color: '#94a3b8'},
]
const BENCHMARK_STORAGE_KEY = 'compare-benchmarks'
const selectedBenchmarks = ref(JSON.parse(localStorage.getItem(BENCHMARK_STORAGE_KEY) || '["^GSPC"]'))
const hiddenStockTickers = ref([])

function toggleBenchmark(symbol) {
  const list = selectedBenchmarks.value
  selectedBenchmarks.value = list.includes(symbol) ? list.filter((s) => s !== symbol) : [...list, symbol]
  localStorage.setItem(BENCHMARK_STORAGE_KEY, JSON.stringify(selectedBenchmarks.value))
}

function toggleStock(ticker) {
  const list = hiddenStockTickers.value
  hiddenStockTickers.value = list.includes(ticker) ? list.filter((t) => t !== ticker) : [...list, ticker]
}

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
  const toSeries = (ticker, color, benchmark = false) => {
    const rows = (series.value[ticker] || []).filter((r) => r.close != null)
    if (!rows.length) return null
    const base = rows[0].close
    if (!base) return null
    return {
      ticker,
      color,
      benchmark,
      points: rows.map((r) => ({date: r.date, pct: ((r.close - base) / base) * 100})),
    }
  }
  const stocks = tickers.value
      .filter((ticker) => !hiddenStockTickers.value.includes(ticker))
      .map((ticker) => toSeries(ticker, colorFor(ticker)))
  const benches = BENCHMARKS
      .filter((b) => selectedBenchmarks.value.includes(b.symbol))
      .map((b) => toSeries(b.symbol, b.color, true))
  return [...stocks, ...benches].filter(Boolean)
})

const legend = computed(() =>
    tickers.value.map((ticker) => {
      const rows = (series.value[ticker] || []).filter((r) => r.close != null)
      const base = rows[0]?.close
      const last = rows[rows.length - 1]?.close
      const pct = base && last != null ? ((last - base) / base) * 100 : null
      return {
        ticker,
        name: stockName(ticker),
        color: colorFor(ticker),
        hidden: hiddenStockTickers.value.includes(ticker),
        pct,
      }
    })
)

const benchmarkLegend = computed(() =>
    BENCHMARKS.map((b) => {
      const s = normalized.value.find((n) => n.ticker === b.symbol)
      return {
        ...b,
        active: selectedBenchmarks.value.includes(b.symbol),
        pct: s ? s.points[s.points.length - 1]?.pct ?? null : null,
      }
    })
)

async function fetchSeries() {
  loading.value = true
  const stockRange = STOCK_RANGE[props.range] || '1mo'
  const wanted = [...tickers.value, ...selectedBenchmarks.value]
  try {
    const entries = await Promise.all(wanted.map(async (ticker) => {
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
  const margin = {top: 6, right: 8, bottom: 6, left: 42}
  const innerW = Math.max(W - margin.left - margin.right, 40)
  const innerH = Math.max(H - margin.top - margin.bottom, 40)
  svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
  const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  const allPoints = normalized.value.flatMap((s) => s.points)
  const x = d3.scaleTime()
      .domain(d3.extent(allPoints, (d) => new Date(d.date)))
      .range([0, innerW])
  const yMin = d3.min(allPoints, (d) => d.pct)
  const yMax = d3.max(allPoints, (d) => d.pct)
  const yPad = (yMax - yMin) * 0.1 || 1
  const y = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([innerH, 0]).nice(4)

  const yTicks = y.ticks(4)
  chart.selectAll('line.compare-grid').data(yTicks).enter().append('line')
      .attr('class', 'compare-grid')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', 'var(--border)')
      .attr('stroke-width', 1)
      .attr('opacity', 0.8)

  chart.selectAll('text.compare-y-label').data(yTicks).enter().append('text')
      .attr('class', 'compare-y-label')
      .attr('x', -8)
      .attr('y', (d) => y(d) + 3)
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 10)
      .text((d) => `${d > 0 ? '+' : ''}${d3.format('~f')(d)}%`)

  chart.append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', y(0)).attr('y2', y(0))
      .attr('stroke', '#c9c4be')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3 3')
      .attr('opacity', 0.8)

  const line = d3.line()
      .x((d) => x(new Date(d.date)))
      .y((d) => y(d.pct))
      .curve(d3.curveMonotoneX)

  normalized.value.forEach((s) => {
    const path = chart.append('path')
        .datum(s.points)
        .attr('fill', 'none')
        .attr('stroke', s.color)
        .attr('stroke-width', s.benchmark ? 1.25 : 1.5)
        .attr('d', line)
    if (s.benchmark) {
      path.attr('stroke-dasharray', '5 4').attr('opacity', 0.75)
    } else {
      chart.append('path')
          .datum(s.points)
          .attr('fill', 'none')
          .attr('stroke', 'transparent')
          .attr('stroke-width', 14)
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .attr('d', line)
          .style('cursor', 'pointer')
          .on('click', () => openPosition(s.ticker, stockName(s.ticker)))
    }
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
watch(selectedBenchmarks, fetchSeries)
watch(hiddenStockTickers, () => nextTick(draw))
watch(series, () => nextTick(draw), {deep: true})
</script>

<template>
  <component :is="embedded ? 'div' : 'section'" v-if="positions.length" class="compare-card" :class="{embedded}">
    <h2 v-if="!embedded" class="card-title">{{ t('dashboard.stockPerformance') }}</h2>

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
          :class="{'stock-off': item.hidden}"
          type="button"
          @click="toggleStock(item.ticker)"
      >
        <span :style="{ background: item.color }" class="legend-dot"/>
        <span class="legend-symbol" :title="`${item.name} · ${item.ticker}`">{{ item.ticker }}</span>
        <span class="legend-name" :title="item.name">{{ item.name }}</span>
        <span v-if="item.pct != null" :class="item.pct >= 0 ? 'up' : 'down'" class="legend-pct">{{ usePercent(item.pct) }}</span>
      </button>

      <button
          v-for="bench in benchmarkLegend"
          :key="bench.symbol"
          :class="{'bench-off': !bench.active}"
          class="legend-item bench-item"
          type="button"
          @click="toggleBenchmark(bench.symbol)"
      >
        <span :style="{ background: bench.active ? bench.color : 'transparent', borderColor: bench.color }"
              class="legend-dot bench-dot"/>
        <span class="legend-name">{{ bench.label }}</span>
        <span v-if="bench.active && bench.pct != null" :class="bench.pct >= 0 ? 'up' : 'down'" class="legend-pct">
          {{ usePercent(bench.pct) }}
        </span>
      </button>
    </div>
  </component>
</template>

<style scoped>
.compare-card {
  background: var(--bg-card);
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
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, max-content));
  gap: 0.35rem;
  margin-top: 0.55rem;
}

.compare-card.embedded {
  border: 0;
  border-radius: 0;
  padding: 0;
  margin: 0;
  background: transparent;
}

.compare-card.embedded .compare-wrap {
  margin-top: 0.1rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  max-width: 230px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 5px 8px;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: border-color 0.15s, background 0.15s;
}

.legend-item:hover {
  background: var(--bg-card);
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
  min-width: 0;
  font-size: 0.68rem;
  font-weight: 500;
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}

.legend-symbol {
  font-size: 0.72rem;
  font-weight: 700;
  flex-shrink: 0;
  color: var(--text-primary);
}

.legend-pct {
  font-size: 0.72rem;
  font-weight: 600;
  margin-left: auto;
  flex-shrink: 0;
}

.legend-pct.up {
  color: var(--neon-green);
}

.legend-pct.down {
  color: var(--neon-red);
}

.bench-item {
  border-style: dashed;
}

.bench-item.bench-off {
  opacity: 0.65;
}

.legend-item.stock-off {
  opacity: 0.52;
}

.legend-item.stock-off .legend-dot {
  background: transparent !important;
  border: 1px solid currentColor;
}

.bench-dot {
  border: 1px solid;
}
</style>
