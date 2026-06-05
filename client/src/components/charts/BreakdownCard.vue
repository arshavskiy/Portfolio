<script setup>
import {computed, nextTick, onMounted, ref, watch} from 'vue'
import * as d3 from 'd3'
import {useRouter} from 'vue-router'
import {useCurrency} from '@/composables/useFormat'

const props = defineProps({
  positions: {type: Array, default: () => []},
})

const router = useRouter()
const svgRef = ref(null)

// Shared categorical palette for allocation slices + legend dots.
const COLORS = ['#3b82f6', '#00ff88', '#f59e0b', '#ff3366', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

const totalValue = computed(() => props.positions.reduce((s, p) => s + p.value, 0))

const isMixed = computed(() =>
    props.positions.some((p) => p.currency === 'ILS') &&
    props.positions.some((p) => p.currency === 'USD')
)

const legend = computed(() =>
    props.positions.map((p, i) => ({
      ticker: p.ticker,
      color: COLORS[i % COLORS.length],
      pct: totalValue.value > 0 ? (p.value / totalValue.value) * 100 : 0,
    }))
)

// Movers strip: every holding with a known day change, sorted by magnitude
// (biggest movers first) so stocks AND crypto both appear.
const movers = computed(() => {
  return props.positions
    .filter((p) => p.changePercent != null)
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
})

function draw() {
  if (!svgRef.value || !props.positions.length) return
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const W = 150
  const H = 150
  const radius = Math.min(W, H) / 2 - 6
  const innerRadius = radius * 0.62

  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H)
  const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`)

  const data = props.positions.map((p, i) => ({
    ticker: p.ticker,
    value: p.value,
    color: COLORS[i % COLORS.length],
  }))

  const pie = d3.pie().value((d) => d.value).sort(null)
  const arc = d3.arc().innerRadius(innerRadius).outerRadius(radius).cornerRadius(3).padAngle(0.025)
  const hoverArc = d3.arc().innerRadius(innerRadius).outerRadius(radius + 5).cornerRadius(3).padAngle(0.025)

  g.selectAll('path')
      .data(pie(data))
      .enter()
      .append('path')
      .attr('fill', (d) => d.data.color)
      .attr('d', arc)
      .style('cursor', 'pointer')
      .on('mouseover', function () {
        d3.select(this).attr('d', hoverArc)
      })
      .on('mouseout', function () {
        d3.select(this).attr('d', arc)
      })
      .on('click', (_, d) => router.push(`/stock/${encodeURIComponent(d.data.ticker)}`))

  g.append('text').attr('text-anchor', 'middle').attr('dy', isMixed.value ? '0.35em' : '-0.3em')
      .attr('fill', '#94a3b8').attr('font-size', '10').text(isMixed.value ? 'Total' : 'Total')
  if (!isMixed.value) {
    g.append('text').attr('text-anchor', 'middle').attr('dy', '1em')
        .attr('fill', '#f1f5f9').attr('font-size', '12').attr('font-weight', '700')
        .text(useCurrency(totalValue.value, props.positions[0]?.currency || 'USD'))
  }
}

onMounted(() => nextTick(draw))
watch(() => props.positions, () => nextTick(draw), {deep: true})
</script>

<template>
  <section v-if="positions.length" class="breakdown-card">
    <h2 class="card-title">Portfolio Breakdown</h2>

    <!-- Allocation -->
    <div class="alloc-row">
      <svg ref="svgRef" class="donut"/>
      <div class="legend">
        <div
            v-for="item in legend"
            :key="item.ticker"
            class="legend-item"
            @click="router.push(`/stock/${encodeURIComponent(item.ticker)}`)"
        >
          <span :style="{ background: item.color }" class="legend-dot"/>
          <span class="legend-ticker">{{ item.ticker }}</span>
          <span class="legend-pct text-muted">{{ item.pct.toFixed(1) }}%</span>
        </div>
      </div>
    </div>

    <!-- Movers strip -->
    <template v-if="movers.length">
      <div class="divider"/>
      <div class="movers-strip">
        <span class="movers-label text-muted">Today</span>
        <div class="movers-items">
          <button
              v-for="m in movers"
              :key="m.ticker"
              class="mover"
              @click="router.push(`/stock/${encodeURIComponent(m.ticker)}`)"
          >
            <span class="mover-ticker">{{ m.ticker }}</span>
            <span :class="m.changePercent >= 0 ? 'up' : 'down'" class="mover-pct">
              {{ m.changePercent >= 0 ? '+' : '' }}{{ m.changePercent.toFixed(2) }}%
            </span>
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.breakdown-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  margin-bottom: 0.75rem;
}

.card-title {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0 0 0.75rem;
}

/* Allocation */
.alloc-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.donut {
  flex: 0 0 auto;
  width: 130px;
  height: 130px;
}

.legend {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  flex: 1;
  min-width: 0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-ticker {
  font-weight: 600;
  flex: 1;
}

.legend-pct {
  font-size: 0.8rem;
}

/* Divider */
.divider {
  height: 1px;
  background: var(--border);
  margin: 0.85rem 0;
}

/* Movers strip */
.movers-strip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.movers-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.movers-items {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  flex: 1;
}

.mover {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 10px;
  cursor: pointer;
  transition: border-color 0.15s;
}

.mover:active {
  border-color: var(--accent);
}

.mover-ticker {
  font-size: 0.82rem;
  font-weight: 700;
}

.mover-pct {
  font-size: 0.8rem;
  font-weight: 700;
}

.mover-pct.up {
  color: var(--neon-green);
}

.mover-pct.down {
  color: var(--neon-red);
}
</style>
