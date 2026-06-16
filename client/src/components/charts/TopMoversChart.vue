<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import * as d3 from 'd3'
import { useRouter } from 'vue-router'

const props = defineProps({
  positions: { type: Array, default: () => [] },
})

const router = useRouter()
const svgRef = ref(null)
const containerRef = ref(null)

function draw() {
  if (!svgRef.value || !props.positions.length) return

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const sorted = [...props.positions]
    .filter((p) => p.changePercent != null)
    .sort((a, b) => b.changePercent - a.changePercent)

  const top = [
    ...sorted.slice(0, 3),
    ...sorted.slice(-Math.min(3, sorted.length)).reverse(),
  ].filter((v, i, a) => a.findIndex(x => x.ticker === v.ticker) === i)

  if (!top.length) return

  const W = containerRef.value.clientWidth
  const margin = { top: 4, right: 72, bottom: 4, left: 86 }
  const rowH = 32
  const H = top.length * rowH + margin.top + margin.bottom

  svg.attr('width', W).attr('height', H)
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  const w = W - margin.left - margin.right
  const maxAbs = d3.max(top, (d) => Math.abs(d.changePercent)) || 1
  const x = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([0, w])
  const y = d3.scaleBand().domain(top.map(d => d.ticker)).range([0, H - margin.top - margin.bottom]).padding(0.25)

  const zero = x(0)

  // Zero line
  g.append('line')
    .attr('x1', zero).attr('x2', zero)
    .attr('y1', 0).attr('y2', H - margin.top - margin.bottom)
    .attr('stroke', '#334155').attr('stroke-width', 1)

  // Bars
  g.selectAll('.bar')
    .data(top)
    .enter().append('rect')
    .attr('class', 'bar')
    .attr('x', (d) => d.changePercent >= 0 ? zero : x(d.changePercent))
    .attr('y', (d) => y(d.ticker))
    .attr('width', (d) => Math.abs(x(d.changePercent) - zero))
    .attr('height', y.bandwidth())
    .attr('fill', (d) => d.changePercent >= 0 ? '#22c55e' : '#ef4444')
    .attr('rx', 3)
    .style('cursor', 'pointer')
    .on('click', (_, d) => router.push(`/position/${d.ticker}`))

  // Ticker labels
  g.selectAll('.label')
    .data(top)
    .enter().append('text')
    .attr('x', -6).attr('y', (d) => y(d.ticker) + y.bandwidth() / 2)
    .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
    .attr('fill', '#f1f5f9').attr('font-size', '12').attr('font-weight', '600')
    .text((d) => d.ticker)
    .style('cursor', 'pointer')
    .on('click', (_, d) => router.push(`/position/${d.ticker}`))

  // Percent labels
  g.selectAll('.pct')
    .data(top)
    .enter().append('text')
    .attr('x', w + 8)
    .attr('y', (d) => y(d.ticker) + y.bandwidth() / 2)
    .attr('text-anchor', 'start')
    .attr('dominant-baseline', 'middle')
    .attr('fill', (d) => d.changePercent >= 0 ? '#22c55e' : '#ef4444')
    .attr('font-size', '11')
    .attr('font-weight', '600')
    .text((d) => `${d.changePercent >= 0 ? '+' : ''}${d.changePercent.toFixed(2)}%`)
}

onMounted(() => nextTick(draw))
watch(() => props.positions, () => nextTick(draw), { deep: true })

const ro = new ResizeObserver(() => nextTick(draw))
onMounted(() => { if (containerRef.value) ro.observe(containerRef.value) })
</script>

<template>
  <div v-if="positions.length" ref="containerRef" class="movers-wrap">
    <svg ref="svgRef" style="display:block;width:100%;" />
  </div>
</template>

<style scoped>
.movers-wrap { width: 100%; }
</style>
