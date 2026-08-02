<script setup>
import {nextTick, onMounted, ref, watch} from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  data: { type: Array, default: () => [] },   // array of { close }
  pnlPercent: { type: Number, default: null },
  height: { type: Number, default: 40 },
})

const svgRef = ref(null)

function draw() {
  if (!svgRef.value || !Array.isArray(props.data) || !props.data.length) return
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const W = svgRef.value.clientWidth || 120
  const H = props.height
  svg.attr('width', W).attr('height', H)

  const firstClose = props.data[0]?.close
  const lastClose = props.data[props.data.length - 1]?.close
  const isWin = props.pnlPercent != null
    ? props.pnlPercent >= 0
    : (lastClose ?? 0) >= (firstClose ?? 0)
  const rootStyle = getComputedStyle(document.documentElement)
  const color = isWin ? rootStyle.getPropertyValue('--green').trim() : rootStyle.getPropertyValue('--red').trim()

  const yMin = d3.min(props.data, d => d.close)
  const yMax = d3.max(props.data, d => d.close)
  // No usable numeric closes → nothing to plot (avoids NaN scale domains).
  if (yMin == null || yMax == null) return
  const x = d3.scaleLinear().domain([0, props.data.length - 1]).range([0, W])
  const yPad = (yMax - yMin) * 0.1 || 1
  const y = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([H - 2, 2])

  const line = d3.line()
    .x((_, i) => x(i))
    .y(d => y(d.close))
    .curve(d3.curveMonotoneX)

  // Glow filter
  const defs = svg.append('defs')
  const filterId = `glow-${Math.random().toString(36).slice(2)}`
  const filter = defs.append('filter').attr('id', filterId)
  filter.append('feGaussianBlur').attr('stdDeviation', '2.5').attr('result', 'blur')
  const feMerge = filter.append('feMerge')
  feMerge.append('feMergeNode').attr('in', 'blur')
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

  // Line with glow (transparent background — no area fill)
  const isDark = document.documentElement.classList.contains('dark')
  svg.append('path')
    .datum(props.data)
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', 1.5)
    .attr('filter', isDark ? `url(#${filterId})` : null)
    .attr('d', line)
}

// Never let a rendering error propagate up and blank the parent row.
function safeDraw() {
  try {
    draw()
  } catch (e) {
    console.error('[StockFolio] Sparkline draw failed', e)
  }
}

onMounted(() => nextTick(safeDraw))
watch(() => props.data, () => nextTick(safeDraw), {deep: true})
</script>

<template>
  <svg ref="svgRef" class="sparkline" />
</template>

<style scoped>
.sparkline { display: block; width: 100%; height: 40px; }
</style>
