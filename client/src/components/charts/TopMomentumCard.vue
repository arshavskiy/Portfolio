<script setup>
import {computed, toRef} from 'vue'
import {useNavigateToPosition} from '@/composables/useNavigateToPosition'
import {usePercent} from '@/composables/useFormat'
import {signalFromScore, useListMomentumScores} from '@/composables/useMomentumScore'
import {useMomentumStore} from '@/stores/momentum'

const props = defineProps({
  items: {type: Array, default: () => []},
  loading: {type: Boolean, default: false},
})

const {openPosition} = useNavigateToPosition()
const momentumStore = useMomentumStore()

// Eagerly compute + publish scores for all items so dashboard doesn't need WatchRow.
useListMomentumScores(toRef(props, 'items'))

function scoreOf(item) {
  void momentumStore.scores
  return momentumStore.getScore(item.ticker) ?? 0
}

const bullish = computed(() =>
  props.items
    .map(item => ({item, score: scoreOf(item)}))
    .filter(({score}) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
)

const bearish = computed(() =>
  props.items
    .map(item => ({item, score: scoreOf(item)}))
    .filter(({score}) => score < 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
)
</script>

<template>
  <div class="momentum-card">
    <h2 class="section-title">Top Momentum</h2>

    <div v-if="loading" class="momentum-loading">
      <div v-for="n in 4" :key="n" class="momentum-skeleton"/>
    </div>

    <div v-else-if="!bullish.length && !bearish.length" class="momentum-empty text-muted">
      No momentum signals available
    </div>

    <div v-else class="momentum-cols">
      <!-- Bullish -->
      <div class="momentum-col">
        <div class="col-header gain">Bullish</div>
        <div
          v-for="{item, score} in bullish"
          :key="item.ticker"
          class="momentum-row"
          @click="openPosition(item.ticker)"
        >
          <div class="row-left">
            <span class="ticker">{{ item.ticker }}</span>
            <span class="company text-muted">{{ item.companyName }}</span>
          </div>
          <div class="row-right">
            <span :class="signalFromScore(score).cls" class="sig">
              {{ signalFromScore(score).icon }}
              <span class="score">(+{{ score }})</span>
            </span>
            <span :class="(item.changePercent ?? 0) >= 0 ? 'gain' : 'loss'" class="pct">
              {{ usePercent(item.changePercent) }}
            </span>
          </div>
        </div>
        <div v-if="!bullish.length" class="col-empty text-muted">None</div>
      </div>

      <!-- Bearish -->
      <div class="momentum-col">
        <div class="col-header loss">Bearish</div>
        <div
          v-for="{item, score} in bearish"
          :key="item.ticker"
          class="momentum-row"
          @click="openPosition(item.ticker)"
        >
          <div class="row-left">
            <span class="ticker">{{ item.ticker }}</span>
            <span class="company text-muted">{{ item.companyName }}</span>
          </div>
          <div class="row-right">
            <span :class="signalFromScore(score).cls" class="sig">
              {{ signalFromScore(score).icon }}
              <span class="score">({{ score }})</span>
            </span>
            <span :class="(item.changePercent ?? 0) >= 0 ? 'gain' : 'loss'" class="pct">
              {{ usePercent(item.changePercent) }}
            </span>
          </div>
        </div>
        <div v-if="!bearish.length" class="col-empty text-muted">None</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.momentum-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
}

.section-title {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.momentum-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.col-header {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.4rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--border);
}

.momentum-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.35rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  cursor: pointer;
  transition: background 0.1s;
  border-radius: 4px;
}

.momentum-row:active {
  background: rgba(255,255,255,0.03);
}

.row-left {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.ticker {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-primary);
}

.company {
  font-size: 0.62rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}

.row-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  flex-shrink: 0;
}

.sig {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

.score {
  font-size: 0.52rem;
  opacity: 0.75;
}

.pct {
  font-size: 0.68rem;
  font-weight: 600;
}

.col-empty {
  font-size: 0.72rem;
  padding: 0.35rem 0;
}

.momentum-loading {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.momentum-skeleton {
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--border) 25%, #475569 50%, var(--border) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Signal colours (mirrors WatchRow) */
.sig-max-bull   { background: rgba(0,195,106,0.28); color: #00c36a; box-shadow: 0 0 8px rgba(0,195,106,0.5); }
.sig-strong-bull { background: rgba(0,195,106,0.18); color: #00c36a; }
.sig-bull        { background: rgba(0,195,106,0.1);  color: #00c36a; }
.sig-max-bear    { background: rgba(224,45,74,0.28); color: #e02d4a; box-shadow: 0 0 8px rgba(224,45,74,0.5); }
.sig-strong-bear { background: rgba(224,45,74,0.18); color: #e02d4a; }
.sig-bear        { background: rgba(224,45,74,0.1);  color: #e02d4a; }
.sig-neutral     { background: rgba(255,255,255,0.05); color: var(--text-secondary); }

.gain { color: #00c36a; }
.loss { color: #e02d4a; }
</style>
