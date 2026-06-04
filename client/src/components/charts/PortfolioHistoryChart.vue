<script setup>
import {nextTick, onMounted, ref, watch} from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  data: {type: Array, default: () => []}, // [{ date, value, cost }]
  loading: {type: Boolean, default: false},
})

const svgRef = ref(null)
const wrapRef = ref(null)

function draw() {
  if (!svgRef.value || !wrapRef.value || !props.data.length) return
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const W = wrapRef.value.clientWidth || 320
  const H = 120
  svg.attr('width', W).attr('height', H)

  const data = props.data
  const first = data[0]
  const last = data[data.length - 1]
  const isWin = last.value >= (first.value || 0)
  const color = isWin ? '#00ff88' : '#ff3366'

  const x = d3.scaleLinear().domain([0, data.length - 1]).range([0, W])
  const yMin = d3.min(data, (d) => Math.min(d.value, d.cost))
  const yMax = d3.max(data, (d) => Math.max(d.value, d.cost))
  const yPad = (yMax - yMin) * 0.1 || 1
  const y = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([H - 2, 2])

  // Glow filter (same as SparklineChart)
  const defs = svg.append('defs')
  const filterId = `glow-${Math.random().toString(36).slice(2)}`
  const filter = defs.append('filter').attr('id', filterId)
  filter.append('feGaussianBlur').attr('stdDeviation', '2.5').attr('result', 'blur')
  const feMerge = filter.append('feMerge')
  feMerge.append('feMergeNode').attr('in', 'blur')
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

  // Area fill under value line
  const area = d3.area()
      .x((_, i) => x(i))
      .y0(H)
      .y1((d) => y(d.value))
      .curve(d3.curveMonotoneX)

  svg.append('path')
      .datum(data)
      .attr('fill', isWin ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,102,0.08)')
      .attr('d', area)

  // Cost basis baseline (dashed, muted)
  const costLine = d3.line()
      .x((_, i) => x(i))
      .y((d) => y(d.cost))
      .curve(d3.curveMonotoneX)

  svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#64748b')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 3')
      .attr('d', costLine)

  // Value line with glow
  const line = d3.line()
      .x((_, i) => x(i))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX)

  svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1.5)
      .attr('filter', `url(#${filterId})`)
      .attr('d', line)
}

let ro
onMounted(() => {
  nextTick(draw)
  ro = new ResizeObserver(() => draw())
  if (wrapRef.value) ro.observe(wrapRef.value)
})
watch(() => props.data, () => nextTick(draw), {deep: true})
</script>

<template>
  <div ref="wrapRef" class="hist-wrap">
    <div v-if="loading" class="hist-state">Loading…</div>
    <div v-else-if="!data.length" class="hist-state">Not enough history yet</div>
    <svg v-else ref="svgRef" class="hist-svg"/>
  </div>
</template>

<style scoped>
.hist-wrap {
  width: 100%;
}

.hist-svg {
  display: block;
  width: 100%;
  height: 120px;
}

.hist-state {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
}
</style>
