<script setup>
import {nextTick, onMounted, ref, watch} from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  data: { type: Array, default: () => [] },   // array of { close }
  pnlPercent: { type: Number, default: null },
})

const svgRef = ref(null)

function draw() {
  if (!svgRef.value || !props.data.length) return
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const W = svgRef.value.clientWidth || 120
  const H = 40
  svg.attr('width', W).attr('height', H)

  const firstClose = props.data[0]?.close
  const lastClose = props.data[props.data.length - 1]?.close
  const isWin = props.pnlPercent != null
    ? props.pnlPercent >= 0
    : (lastClose ?? 0) >= (firstClose ?? 0)
  const color = isWin ? '#00ff88' : '#ff3366'

  const x = d3.scaleLinear().domain([0, props.data.length - 1]).range([0, W])
  const yMin = d3.min(props.data, d => d.close)
  const yMax = d3.max(props.data, d => d.close)
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
  svg.append('path')
    .datum(props.data)
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', 1.5)
    .attr('filter', `url(#${filterId})`)
    .attr('d', line)
}

onMounted(() => nextTick(draw))
watch(() => props.data, () => nextTick(draw), { deep: true })
</script>

<template>
  <svg ref="svgRef" class="sparkline" />
</template>

<style scoped>
.sparkline { display: block; width: 100%; height: 40px; }
</style>
