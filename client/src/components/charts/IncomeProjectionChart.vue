<script setup>
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import * as d3 from 'd3'
import {useI18n} from '@/composables/useI18n'
import {useTheme} from '@/composables/useTheme'
import {useCurrency} from '@/composables/useFormat'
import AppLoader from '@/components/ui/AppLoader.vue'

const props = defineProps({
  data: {type: Array, default: () => []},
  loading: {type: Boolean, default: false},
  hideLoading: {type: Boolean, default: false},
  totals: {type: Object, default: () => ({})},
})

const {t} = useI18n()
const {theme} = useTheme()
const svgRef = ref(null)
const wrapRef = ref(null)

const CUMULATIVE_KEY = 'income-projection-cumulative'
const cumulative = ref(localStorage.getItem(CUMULATIVE_KEY) === 'true')

function setCumulative(value) {
  cumulative.value = value
  localStorage.setItem(CUMULATIVE_KEY, String(value))
}

// Cumulative mode turns each bar into the running total of every month before
// it. Gains and dividends accumulate separately so the stack segments keep
// their meaning. There is no calendar-year reset — the total runs across the
// whole window, so bar height reads as "income since the window started".
const chartMonths = computed(() => {
  if (!cumulative.value) return props.data
  let gains = 0
  let divs = 0
  return props.data.map((m) => {
    gains += m.realizedGains || 0
    divs += m.dividends || 0
    // Kept so the tooltip can still report this month's own contribution,
    // which is otherwise unrecoverable once values are accumulated.
    return {
      ...m,
      realizedGains: gains,
      dividends: divs,
      monthlyTotal: (m.realizedGains || 0) + (m.dividends || 0),
    }
  })
})

// Cheap signature so we redraw on real change without deep-watching the array.
const dataSignature = computed(() =>
    props.data.map((m) => `${m.key}:${m.realizedGains}:${m.dividends}:${m.portfolioValue}`).join('|')
)

const projectedTotal = computed(() => Number(props.totals?.projectedIncome) || 0)
const displayedProjectedTotal = computed(() => {
  if (!cumulative.value) return projectedTotal.value

  const lastMonth = chartMonths.value.at(-1)
  if (!lastMonth) return 0
  // Only count future dividends, not realized gains/losses
  return lastMonth.dividends || 0
})

function draw() {
  const svg = d3.select(svgRef.value)
  if (!svgRef.value || !wrapRef.value) return
  svg.selectAll('*').remove()
  const months = chartMonths.value
  if (!months.length) return

  const W = wrapRef.value.clientWidth || 320
  const H = 200
  const margin = {top: 10, right: 48, bottom: 26, left: 44}
  const innerW = Math.max(W - margin.left - margin.right, 40)
  const innerH = Math.max(H - margin.top - margin.bottom, 40)

  svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  const x = d3.scaleBand().domain(months.map((m) => m.key)).range([0, innerW]).padding(0.28)
  const barWidth = Math.min(x.bandwidth(), W < 768 ? 10 : 25)
  const barX = (d) => x(d.key) + (x.bandwidth() - barWidth) / 2

  // Left axis: stacked income bars — each month's bar is total income, split
  // into realized gains + dividends. Right axis: portfolio value line, a
  // different quantity that would crush the bars if it shared the left axis.
  // Stacking only holds above zero; a realized loss is drawn below the
  // baseline on its own rather than subtracting from the dividend segment.
  const positiveTotal = (m) => Math.max(m.realizedGains || 0, 0) + Math.max(m.dividends || 0, 0)
  const maxIncome = d3.max(months, positiveTotal) || 0
  const minIncome = d3.min(months, (m) => Math.min(m.realizedGains || 0, 0)) || 0
  const y = d3.scaleLinear().domain([minIncome, maxIncome || 1]).nice().range([innerH, 0])

  const maxValue = d3.max(months, (m) => m.portfolioValue || 0) || 0
  const yValue = d3.scaleLinear().domain([0, maxValue || 1]).nice().range([innerH, 0])

  // Gridlines + left ticks
  const yTicks = y.ticks(4)
  g.selectAll('line.grid').data(yTicks).enter().append('line')
      .attr('class', 'grid')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', (d) => y(d)).attr('y2', (d) => y(d))
      .attr('stroke', 'var(--border)')
      .attr('stroke-width', 1)

  g.selectAll('text.y-label').data(yTicks).enter().append('text')
      .attr('class', 'y-label')
      .attr('x', -8).attr('y', (d) => y(d) + 3)
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 9)
      .text((d) => d3.format('~s')(d))

  // X labels thin out on narrow widths so they never overlap.
  const labelEvery = Math.max(1, Math.ceil(months.length / Math.max(3, Math.floor(W / 80))))
  g.selectAll('text.x-label').data(months).enter().append('text')
      .attr('class', 'x-label')
      .attr('x', (d) => x(d.key) + x.bandwidth() / 2)
      .attr('y', innerH + 16)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 9)
      .text((d, i) => (i % labelEvery === 0 ? d.label : ''))

  const zeroY = y(0)
  // Realized gains sit on the baseline; dividends stack on top of the positive
  // part of them. A negative month draws its gains bar below zero, leaving the
  // dividend segment still anchored at the baseline.
  const barFor = (series, color, baseline) => {
    g.selectAll(`rect.bar-${series}`).data(months).enter().append('rect')
        .attr('class', `bar-${series}`)
        .attr('x', barX)
        .attr('width', barWidth)
        .attr('y', (d) => {
          const value = d[series] || 0
          const base = baseline(d)
          return value >= 0 ? y(base + value) : y(base)
        })
        .attr('height', (d) => {
          const value = d[series] || 0
          const base = baseline(d)
          return Math.abs(y(base) - y(base + value))
        })
        .attr('fill', color)
        // Estimated months read as lighter so they aren't mistaken for actuals.
        .attr('opacity', (d) => (d.estimated ? 0.45 : 1))
        .append('title')
        .text((d) => {
          const label = t(`dashboard.${series === 'dividends' ? 'incomeDividends' : 'incomeRealized'}`)
          const parts = [`${d.label} · ${label}: ${useCurrency(d[series] || 0, 'USD')}`]
          // Accumulated bars hide the month's own figure — surface it here.
          if (cumulative.value && d.monthlyTotal != null) {
            parts.push(`${t('dashboard.incomeThisMonth')}: ${useCurrency(d.monthlyTotal, 'USD')}`)
          }
          if (d.estimated) parts.push(`(${t('dashboard.incomeEstimated')})`)
          return parts.join(' · ')
        })
  }
  barFor('realizedGains', 'var(--accent)', () => 0)
  barFor('dividends', 'var(--green)', (d) => Math.max(d.realizedGains || 0, 0))

  // Total income printed above each stack. Skipped for empty months, and
  // thinned on narrow widths using the same cadence as the x labels so the
  // figures never collide.
  const compact = d3.format('~s')
  g.selectAll('text.bar-total').data(months).enter().append('text')
      .attr('class', 'bar-total')
      .attr('x', (d) => x(d.key) + x.bandwidth() / 2)
      .attr('y', (d) => y(positiveTotal(d)) - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 9)
      .attr('font-weight', 600)
      .attr('opacity', (d) => (d.estimated ? 0.6 : 1))
      .text((d, i) => {
        const total = positiveTotal(d)
        if (total <= 0) return ''
        return i % labelEvery === 0 ? compact(total) : ''
      })

  // Zero baseline only matters when a month had a realized loss.
  if (minIncome < 0) {
    g.append('line')
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', zeroY).attr('y2', zeroY)
        .attr('stroke', 'var(--text-secondary)')
        .attr('stroke-width', 1)
  }

  // Portfolio value line on the right axis, dashed to match the overlay
  // treatment used for benchmarks in PortfolioCompareChart.
  if (maxValue > 0) {
    const line = d3.line()
        .x((d) => x(d.key) + x.bandwidth() / 2)
        .y((d) => yValue(d.portfolioValue || 0))
        .curve(d3.curveMonotoneX)

    g.append('path')
        .datum(months)
        .attr('fill', 'none')
        .attr('stroke', 'var(--purple)')
        .attr('stroke-width', 1.8)
        .attr('stroke-dasharray', '5 4')
        .attr('opacity', 0.75)
        .attr('d', line)

    g.selectAll('text.yv-label').data(yValue.ticks(3)).enter().append('text')
        .attr('class', 'yv-label')
        .attr('x', innerW + 6).attr('y', (d) => yValue(d) + 3)
        .attr('text-anchor', 'start')
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', 9)
        .text((d) => d3.format('~s')(d))
  }

  // "Today" divider between the last actual month and the first estimate.
  const firstEstimate = months.findIndex((m) => m.estimated)
  if (firstEstimate > 0) {
    const dividerX = x(months[firstEstimate].key) - x.step() * x.padding() / 2
    g.append('line')
        .attr('x1', dividerX).attr('x2', dividerX)
        .attr('y1', 0).attr('y2', innerH)
        .attr('stroke', 'var(--text-secondary)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3 3')
        .attr('opacity', 0.5)
  }
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
watch(cumulative, () => nextTick(draw))
// Colors come from CSS variables resolved by the browser, but tick text and
// any computed values are baked in at draw time — redraw so a theme switch
// never leaves stale contrast behind.
watch(theme, () => nextTick(draw))
// The <svg> is torn down by the loading/empty branches, so re-observe and
// redraw once it comes back.
watch(() => props.loading, async (isLoading) => {
  if (isLoading) return
  await nextTick()
  if (ro && wrapRef.value) ro.observe(wrapRef.value)
  draw()
})
</script>

<template>
  <section class="income-card">
    <header class="income-head">
      <h3 class="card-title">{{ t('dashboard.incomeProjection') }}</h3>
      <div class="income-head-right">
        <div class="toggle-group">
          <button
              :class="{active: !cumulative}"
              class="toggle-btn"
              type="button"
              @click="setCumulative(false)"
          >{{ t('dashboard.incomeMonthly') }}
          </button>
          <button
              :class="{active: cumulative}"
              class="toggle-btn"
              type="button"
              @click="setCumulative(true)"
          >{{ t('dashboard.incomeCumulative') }}
          </button>
        </div>
        <div v-if="displayedProjectedTotal" class="income-est">
          <span class="income-est-label">{{ t('dashboard.incomeProjectedNext') }}</span>
          <span class="income-est-value">{{ useCurrency(displayedProjectedTotal, 'USD') }}</span>
        </div>
      </div>
    </header>

    <div ref="wrapRef" class="income-wrap">
      <div v-if="loading && !hideLoading" class="income-state">
        <AppLoader/>
      </div>
      <div v-else-if="!loading && !data.length" class="income-state">
        {{ t('dashboard.incomeEmpty') }}
      </div>
      <svg v-else ref="svgRef" class="income-svg"/>
    </div>

    <div v-if="data.length" class="income-legend">
      <span class="legend-item">
        <span class="legend-dot" style="background: var(--accent)"/>
        {{ t('dashboard.incomeRealized') }}
      </span>
      <span class="legend-item">
        <span class="legend-dot" style="background: var(--green)"/>
        {{ t('dashboard.incomeDividends') }}
      </span>
      <span class="legend-item">
        <span class="legend-dash"/>
        {{ t('dashboard.incomePortfolioValue') }}
      </span>
      <span class="legend-note">{{ t('dashboard.incomeEstimateNote') }}</span>
    </div>
  </section>
</template>

<style scoped>
.income-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  margin-bottom: 0.75rem;
}

.income-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.card-title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0;
}

.income-head-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.toggle-group {
  display: flex;
  gap: 0.25rem;
}

.toggle-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.toggle-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.income-est {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}

.income-est-label {
  font-size: 0.62rem;
  color: var(--text-secondary);
}

.income-est-value {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--green);
}

.income-wrap {
  width: 100%;
}

.income-svg {
  display: block;
  width: 100%;
  height: 200px;
}

.income-state {
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-align: center;
}

.income-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.5rem;
  font-size: 0.68rem;
  color: var(--text-secondary);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-dash {
  width: 12px;
  height: 0;
  border-top: 2px dashed var(--purple);
}

.legend-note {
  margin-left: auto;
  opacity: 0.8;
}
</style>
