<script setup>
import {computed} from 'vue'
import {useRouter} from 'vue-router'
import {gainLossClass, usePercent, useTickerCurrency} from '@/composables/useFormat'
import {useAlertsStore} from '@/stores/alerts'
import SparklineChart from '@/components/charts/SparklineChart.vue'

const props = defineProps({
  pos: {type: Object, required: true},
  sparkline: {type: Array, default: () => []},
  compact: {type: Boolean, default: false},
})
const emit = defineEmits(['delete', 'sell', 'edit-groups'])
const router = useRouter()
const alerts = useAlertsStore()

// Active price alerts on this ticker → drives the bell indicator.
const activeAlerts = computed(() =>
    alerts.forTicker(props.pos.ticker).filter((a) => a.active).length
)

const rangeStartPrice = computed(() => props.sparkline?.[0]?.close ?? null)
const rangeEndPrice = computed(() => props.sparkline?.[props.sparkline.length - 1]?.close ?? null)
const compactRangeValue = computed(() => {
  const end = rangeEndPrice.value
  if (end != null) return end * (props.pos.shares || 0)
  return props.pos.value
})
const compactRangePercent = computed(() => {
  const start = rangeStartPrice.value
  const end = rangeEndPrice.value
  if (start == null || end == null || start === 0) return props.pos.pnlPercent
  return ((end - start) / start) * 100
})
const extendedChangePercent = computed(() =>
  props.pos.postMarketChangePercent ?? props.pos.preMarketChangePercent ?? null
)
</script>

<template>
  <!-- ── Compact (row) mode ── -->
  <div
      v-if="compact"
      :class="compactRangePercent >= 0 ? 'neon-row-gain' : 'neon-row-loss'"
      class="compact-row"
      @click="router.push(`/position/${pos.ticker}`)"
  >
    <div class="row-left">
      <span class="ticker">
        {{ pos.ticker }}
        <span v-if="activeAlerts" :title="`${activeAlerts} active alert${activeAlerts > 1 ? 's' : ''}`"
              class="alert-badge">
          <i class="pi pi-bell"/>
          <span v-if="activeAlerts > 1" class="alert-count">{{ activeAlerts }}</span>
        </span>
      </span>
      <span class="company text-muted">{{ pos.companyName }}</span>
      <div class="group-tags compact-tags" @click.stop="emit('edit-groups', pos)">
        <span v-for="g in pos.groups || []" :key="g" class="group-tag">{{ g }}</span>
        <span class="group-tag add-tag">
          <i class="pi pi-plus"/><span v-if="!pos.groups?.length"> Tag</span>
        </span>
      </div>
    </div>

    <div class="row-chart">
      <SparklineChart
          v-if="sparkline?.length"
          :data="sparkline"
      />
      <div v-if="sparkline?.length" class="chart-range-labels text-muted">
        <span>{{ useTickerCurrency(rangeStartPrice, pos.ticker) }}</span>
        <span>{{ useTickerCurrency(rangeEndPrice, pos.ticker) }}</span>
      </div>
    </div>

    <div class="row-right">
      <span class="price">{{ useTickerCurrency(compactRangeValue, pos.ticker) }}</span>
      <span :class="compactRangePercent >= 0 ? 'badge-gain' : 'badge-loss'" class="badge">
        {{ usePercent(compactRangePercent) }}
      </span>
      <span
          v-if="extendedChangePercent != null"
          :class="extendedChangePercent >= 0 ? 'extended-gain' : 'extended-loss'"
          class="extended-change"
      >
        <span class="extended-icon">
          <i class="pi pi-sun"/>
        </span>
        {{ usePercent(extendedChangePercent) }}
      </span>
    </div>

  </div>

  <!-- ── Full (card) mode ── -->
  <div
      v-else
      :class="pos.pnl >= 0 ? 'neon-card-gain' : 'neon-card-loss'"
      class="position-card"
  >
    <div class="pos-top" @click="router.push(`/position/${pos.ticker}`)">
      <div>
        <span class="ticker">
          {{ pos.ticker }}
          <span v-if="activeAlerts" :title="`${activeAlerts} active alert${activeAlerts > 1 ? 's' : ''}`"
                class="alert-badge">
            <i class="pi pi-bell"/>
            <span v-if="activeAlerts > 1" class="alert-count">{{ activeAlerts }}</span>
          </span>
        </span>
        <span class="company text-muted">{{ pos.companyName }}</span>
        <div class="group-tags" @click.stop="emit('edit-groups', pos)">
          <span v-for="g in pos.groups || []" :key="g" class="group-tag">{{ g }}</span>
          <span class="group-tag add-tag">
            <i class="pi pi-plus"/> {{ pos.groups?.length ? 'Edit' : 'Tag' }}
          </span>
        </div>
      </div>
      <div class="pos-value">
        <span class="value">{{ useTickerCurrency(pos.value, pos.ticker) }}</span>
        <span :class="gainLossClass(pos.pnl)" class="pnl">
          {{ useTickerCurrency(pos.pnl, pos.ticker) }} ({{ usePercent(pos.pnlPercent) }})
        </span>
        <span
            v-if="extendedChangePercent != null"
            :class="extendedChangePercent >= 0 ? 'extended-gain' : 'extended-loss'"
            class="extended-change card-extended-change"
        >
          <span class="extended-icon">
            <i class="pi pi-sun"/>
          </span>
          {{ usePercent(extendedChangePercent) }}
        </span>
      </div>
    </div>

    <SparklineChart
        v-if="sparkline?.length"
        :data="sparkline"
        :pnl-percent="pos.pnlPercent"
        class="pos-spark"
    />

    <div class="pos-details">
      <div class="detail">
        <span class="text-muted">Shares</span>
        <span>{{ pos.shares }}</span>
      </div>
      <div class="detail">
        <span class="text-muted">Avg Cost</span>
        <span>{{ useTickerCurrency(pos.avgCost, pos.ticker) }}</span>
      </div>
      <div class="detail">
        <span class="text-muted">Current</span>
        <span>{{ useTickerCurrency(pos.currentPrice, pos.ticker) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Full card ── */
.position-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.neon-card-gain {
  min-height: 173px;
  border-color: rgba(0, 195, 106, 0.5);
  box-shadow: 0 0 10px rgba(0, 195, 106, 0.15), inset 0 0 6px rgba(0, 195, 106, 0.05);
}

.neon-card-loss {
  border-color: rgba(224, 45, 74, 0.5);
  box-shadow: 0 0 10px rgba(224, 45, 74, 0.15), inset 0 0 6px rgba(224, 45, 74, 0.05);
}

.pos-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem;
  cursor: pointer;
}

.pos-spark {
  margin: 0 -1px;
  width: calc(100% + 2px);
  height: 50px;
}

.pos-value {
  text-align: right;
}

.value {
  display: block;
  font-weight: 600;
}

.pnl {
  display: block;
  font-size: 0.8rem;
}

.pos-details {
  display: flex;
  align-items: center;
  padding: 0.6rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-top: 1px solid var(--border);
  gap: 1rem;
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.8rem;
  flex: 1;
}

.detail .text-muted {
  font-size: 0.72rem;
}

/* ── Compact row ── */
.compact-row {
  display: flex;
  align-items: center;
  padding: 0.75rem 0.25rem;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.015));
  border: 1px solid var(--border);
  border-radius: 14px;
  gap: 0.5rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.compact-row:active {
  background: rgba(255, 255, 255, 0.03);
  transform: scale(0.99);
}

.neon-row-gain {
  border-left: 3px solid rgba(0, 195, 106, 0.8);
  padding-left: 0.5rem;
  box-shadow: 0 0 14px rgba(0, 195, 106, 0.12), inset 0 0 10px rgba(0, 195, 106, 0.035);
}

.neon-row-loss {
  border-left: 3px solid rgba(224, 45, 74, 0.8);
  padding-left: 0.5rem;
  box-shadow: 0 0 14px rgba(224, 45, 74, 0.12), inset 0 0 10px rgba(224, 45, 74, 0.035);
}

.row-left {
  display: flex;
  flex-direction: column;
  min-width: 90px;
  flex: 0 0 90px;
}

.compact-tags {
  margin-top: 3px;
}

.compact-tags .group-tag {
  font-size: 0.55rem;
  padding: 0 5px;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-chart {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 40px;
}

.chart-range-labels {
  position: absolute;
  inset: auto 0 -12px 0;
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.58rem;
  line-height: 1;
  pointer-events: none;
}

.row-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 76px;
  flex: 0 0 76px;
  gap: 4px;
}

.price {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* Shared */
.ticker {
  font-weight: 700;
  font-size: 0.85rem;
  display: block;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.company {
  font-size: 0.72rem;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
}

.group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
  cursor: pointer;
  width: fit-content;
}

.group-tag {
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 1px 7px;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #93c5fd;
}

.add-tag {
  background: transparent;
  border: 1px dashed var(--border);
  color: var(--text-secondary);
}

.add-tag i {
  font-size: 0.55rem;
}

.alert-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  color: var(--neon-blue);
  vertical-align: middle;
}

.alert-badge i {
  font-size: 0.7rem;
  filter: drop-shadow(0 0 4px var(--neon-blue));
}

.alert-count {
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1;
}

.badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 5px;
  min-width: 64px;
  text-align: center;
}

.badge-gain {
  background: #00c36a;
  color: #fff;
}

.badge-loss {
  background: #e02d4a;
  color: #fff;
}

.extended-change {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
}

.card-extended-change {
  margin-top: 5px;
}

.extended-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgba(168, 85, 247, 0.28);
  color: #c084fc;
  box-shadow: 0 0 10px rgba(168, 85, 247, 0.28);
}

.extended-icon i {
  font-size: 0.65rem;
}

.extended-gain {
  color: #00c36a;
}

.extended-loss {
  color: #e02d4a;
}

</style>
