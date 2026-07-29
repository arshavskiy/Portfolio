<script setup>
import {onBeforeUnmount, onMounted, ref, watch} from 'vue'
import * as d3 from 'd3'
import {useRouter} from 'vue-router'
import api from '@/composables/useApi'
import {useI18n} from '@/composables/useI18n'
import AppLoader from '@/components/ui/AppLoader.vue'

const props = defineProps({
  ticker: {type: String, required: true},
})

const router = useRouter()
const {t} = useI18n()

const svgRef = ref(null)
const wrapRef = ref(null)
const loading = ref(false)
const error = ref('')
const related = ref([])
let simulation = null

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
const SENTIMENT_POS = cssVar('--green')
const SENTIMENT_NEG = cssVar('--red')
const SENTIMENT_NEUTRAL = '#94a3b8'
const CENTER_COLOR = '#3b82f6'

function colorForSentiment(s) {
  if (s == null) return SENTIMENT_NEUTRAL
  if (s > 0.15) return SENTIMENT_POS
  if (s < -0.15) return SENTIMENT_NEG
  return SENTIMENT_NEUTRAL
}

function draw() {
  if (!svgRef.value || !wrapRef.value) return
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()
  if (simulation) simulation.stop()

  const W = wrapRef.value.clientWidth || 360
  const H = 320
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H)

  const centerNode = {id: props.ticker, isCenter: true}
  const nodes = [centerNode, ...related.value.map((r) => ({
    id: r.ticker, weight: r.weight, sentiment: r.latestSentiment,
    headline: r.latestHeadline, url: r.latestUrl,
  }))]
  const links = related.value.map((r) => ({source: props.ticker, target: r.ticker, weight: r.weight}))

  const maxWeight = d3.max(related.value, (r) => r.weight) || 1
  const radiusScale = d3.scaleSqrt().domain([1, maxWeight]).range([10, 26]).clamp(true)

  simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance((l) => 70 + (1 - l.weight / maxWeight) * 90))
      .force('charge', d3.forceManyBody().strength(-140))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide().radius((d) => (d.isCenter ? 34 : radiusScale(d.weight || 1) + 6)))
      .force('x', d3.forceX(W / 2).strength(0.05))
      .force('y', d3.forceY(H / 2).strength(0.05))

  const link = svg.append('g').selectAll('line')
      .data(links).enter().append('line')
      .attr('stroke', 'var(--border)')
      .attr('stroke-width', (d) => 1 + Math.sqrt(d.weight))
      .attr('opacity', 0.55)

  const node = svg.append('g').selectAll('g')
      .data(nodes).enter().append('g')
      .style('cursor', 'pointer')
      .call(d3.drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.25).restart();
            d.fx = d.x;
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null
          }))
      .on('click', (event, d) => {
        if (!d.isCenter) router.push(`/position/${encodeURIComponent(d.id)}`)
      })

  node.append('circle')
      .attr('r', (d) => (d.isCenter ? 30 : radiusScale(d.weight || 1)))
      .attr('fill', (d) => (d.isCenter ? CENTER_COLOR : colorForSentiment(d.sentiment)))
      .attr('stroke', 'var(--bg-card, #070707)')
      .attr('stroke-width', 2)

  node.append('text')
      .text((d) => d.id)
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => (d.isCenter ? 45 : radiusScale(d.weight || 1) + 14))
      .attr('fill', 'var(--text-primary)')
      .attr('font-size', (d) => (d.isCenter ? '12' : '10'))
      .attr('font-weight', (d) => (d.isCenter ? '700' : '500'))

  node.append('title').text((d) => (d.isCenter ? d.id : `${d.id}\n${d.weight} shared article${d.weight === 1 ? '' : 's'}${d.headline ? '\n' + d.headline : ''}`))

  simulation.on('tick', () => {
    link
        .attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y)
    node.attr('transform', (d) => `translate(${d.x},${d.y})`)
  })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get(`/enrich/related/${encodeURIComponent(props.ticker)}`)
    related.value = data.related || []
  } catch (err) {
    error.value = err.message || 'Failed to load related tickers'
    related.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.ticker, load)
// svgRef only exists in the DOM once `related` is non-empty (v-else branch) and
// loading has finished — waiting on the ref itself avoids a nextTick() race
// where draw() runs before the v-if/v-else swap has actually mounted the <svg>.
// Also re-run on `related` changes for the case where the <svg> was already
// mounted from a previous ticker and never unmounts (ref identity doesn't change).
watch(svgRef, (el) => {
  if (el) draw()
})
watch(related, () => {
  if (svgRef.value) draw()
})
onBeforeUnmount(() => {
  if (simulation) simulation.stop()
})
</script>

<template>
  <div v-if="loading" class="research-card relation-card relation-loading">
    <AppLoader/>
  </div>

  <div v-else-if="error" class="research-card relation-card relation-error text-muted">
    <i class="pi pi-exclamation-triangle"/> {{ error }}
  </div>

  <div v-else class="research-card relation-card">
    <div class="relation-head">
      <h2 class="stat-label-info relation-title">
        <i class="pi pi-share-alt"/> {{ t('relationGraph.title') }}
        <i v-tooltip.focus.top="t('relationGraph.titleInfo')" class="pi pi-info-circle info-icon" tabindex="0"/>
      </h2>
      <div class="legend">
        <span class="legend-item"><span :style="{background: SENTIMENT_POS}" class="dot"/>{{
            t('relationGraph.bullish')
          }}</span>
        <span class="legend-item"><span :style="{background: SENTIMENT_NEG}" class="dot"/>{{
            t('relationGraph.bearish')
          }}</span>
        <span class="legend-item"><span :style="{background: SENTIMENT_NEUTRAL}" class="dot"/>{{
            t('relationGraph.neutral')
          }}</span>
      </div>
    </div>

    <div v-if="!related.length" class="empty-state inline">
      <i class="pi pi-share-alt"/>
      <p>{{ t('relationGraph.emptyTitle') }}</p>
      <span>{{ t('relationGraph.emptyHint') }}</span>
    </div>

    <div v-else ref="wrapRef" class="graph-wrap">
      <svg ref="svgRef"/>
    </div>

    <p v-if="related.length" class="relation-hint text-muted">{{ t('relationGraph.hint') }}</p>
  </div>
</template>

<style scoped>
.relation-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-secondary, #111111);
  margin: 1rem 0;
  overflow: hidden;
}

.relation-loading, .relation-error {
  padding: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.relation-head {
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border);
}

.relation-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.relation-title > .pi-share-alt {
  color: var(--accent);
  font-size: 0.85rem;
}

.info-icon {
  font-size: 0.72rem;
  opacity: 0.55;
  cursor: pointer;
}

.info-icon:hover {
  opacity: 1;
  color: var(--accent);
}

.info-icon:focus {
  opacity: 1;
  color: var(--accent);
  outline: none;
}

.legend {
  display: flex;
  gap: 0.75rem;
  color: var(--text-secondary);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.legend-item .dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
}

.graph-wrap {
  width: 100%;
}

.graph-wrap svg {
  display: block;
}

.relation-hint {
  padding: 0.5rem 0.95rem 0.75rem;
  margin: 0;
}

.empty-state.inline {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.82rem;
  text-align: center;
  padding: 2rem 1.25rem;
}

.empty-state.inline > .pi {
  font-size: 2rem;
  opacity: 0.3;
  margin-bottom: 0.25rem;
}

.empty-state.inline p {
  margin: 0;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-state.inline span {
  font-size: 0.75rem;
  line-height: 1.4;
  max-width: 280px;
}
</style>
