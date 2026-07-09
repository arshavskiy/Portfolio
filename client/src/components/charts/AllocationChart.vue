<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import * as d3 from 'd3'
import { useCurrency } from '@/composables/useFormat'
import {useI18n} from '@/composables/useI18n'

const props = defineProps({
  positions: { type: Array, default: () => [] },
  combinedUsd: { type: Object, default: null },
})
const {t} = useI18n()

const svgRef = ref(null)

const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16']

function draw() {
  if (!svgRef.value || !props.positions.length) return

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const W = 280
  const H = 200
  const radius = Math.min(W, H) / 2 - 10
  const innerRadius = radius * 0.55

  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H)

  const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`)

  // Always use native value — proportions within same currency are correct,
  // mixed currency just shows relative weight by local value
  const data = props.positions.map((p, i) => ({
    ticker: p.ticker,
    value: p.value,
    color: COLORS[i % COLORS.length],
  }))

  const pie = d3.pie().value((d) => d.value).sort(null)
  const arc = d3.arc().innerRadius(innerRadius).outerRadius(radius).cornerRadius(3).padAngle(0.02)
  const hoverArc = d3.arc().innerRadius(innerRadius).outerRadius(radius + 6).cornerRadius(3).padAngle(0.02)

  const arcs = g.selectAll('.arc').data(pie(data)).enter().append('g').attr('class', 'arc')

  arcs.append('path')
    .attr('fill', (d) => d.data.color)
    .attr('d', arc)
    .style('cursor', 'pointer')
    .on('mouseover', function (_, d) { d3.select(this).attr('d', hoverArc) })
    .on('mouseout', function (_, d) { d3.select(this).attr('d', arc) })

  // Center label — hide total when mixed currencies (values incomparable)
  const isMixed = props.positions.some(p => p.currency === 'ILS') && props.positions.some(p => p.currency === 'USD')
  const totalLabel = isMixed ? null : useCurrency(d3.sum(data, d => d.value), props.positions[0]?.currency || 'USD')

  g.append('text').attr('text-anchor', 'middle').attr('dy', isMixed ? '0.35em' : '-0.2em')
    .attr('fill', '#94a3b8').attr('font-size', '11')
      .text(isMixed ? t('dashboard.mixed') : t('dashboard.total'))
  if (totalLabel) {
    g.append('text').attr('text-anchor', 'middle').attr('dy', '1em')
      .attr('fill', '#f1f5f9').attr('font-size', '12').attr('font-weight', '600')
      .text(totalLabel)
  }
}

onMounted(() => nextTick(draw))
watch(() => [props.positions, props.combinedUsd], () => nextTick(draw), { deep: true })
</script>

<template>
  <div v-if="positions.length" class="allocation-wrap">
    <h2 class="section-title">{{ t('dashboard.allocation') }}</h2>
    <div class="chart-row">
      <svg ref="svgRef" />
      <div class="legend">
        <div v-for="(pos, i) in positions" :key="pos.ticker" class="legend-item">
          <span class="legend-dot" :style="{ background: COLORS[i % COLORS.length] }" />
          <span class="legend-ticker">{{ pos.ticker }}</span>
          <span class="legend-pct text-muted">
            {{ (() => {
              const total = positions.reduce((s, p) => s + p.value, 0)
              return total > 0 ? (pos.value / total * 100).toFixed(1) + '%' : ''
            })() }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.allocation-wrap { margin-bottom: 1rem; }
.section-title { font-size: 0.78rem; font-weight: 700; margin-bottom: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
.chart-row { display: flex; align-items: center; gap: 1rem; }
svg { flex: 0 0 auto; width: 160px; }
.legend { display: flex; flex-direction: column; gap: 0.4rem; flex: 1; }
.legend-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.legend-ticker { font-weight: 600; flex: 1; }
.legend-pct { font-size: 0.78rem; }
</style>
