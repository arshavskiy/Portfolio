<script setup>
import {useRouter} from 'vue-router'
import {gainLossClass, usePercent, useTickerCurrency} from '@/composables/useFormat'
import Button from 'primevue/button'
import SparklineChart from '@/components/charts/SparklineChart.vue'

defineProps({
  pos: {type: Object, required: true},
  sparkline: {type: Array, default: () => []},
  compact: {type: Boolean, default: false},
})
const emit = defineEmits(['delete'])
const router = useRouter()
</script>

<template>
  <!-- ── Compact (row) mode ── -->
  <div
      v-if="compact"
      :class="pos.pnl >= 0 ? 'neon-row-gain' : 'neon-row-loss'"
      class="compact-row"
      @click="router.push(`/stock/${pos.ticker}`)"
  >
    <div class="row-left">
      <span class="ticker">{{ pos.ticker }}</span>
      <span class="company text-muted">{{ pos.companyName }}</span>
    </div>

    <div class="row-chart">
      <SparklineChart
          v-if="sparkline?.length"
          :data="sparkline"
          :pnl-percent="pos.pnlPercent"
      />
    </div>

    <div class="row-right">
      <span class="price">{{ useTickerCurrency(pos.value, pos.ticker) }}</span>
      <span :class="pos.pnlPercent >= 0 ? 'badge-gain' : 'badge-loss'" class="badge">
        {{ usePercent(pos.pnlPercent) }}
      </span>
    </div>

    <button class="remove-btn" @click.stop="emit('delete', pos)">
      <i class="pi pi-times"/>
    </button>
  </div>

  <!-- ── Full (card) mode ── -->
  <div
      v-else
      :class="pos.pnl >= 0 ? 'neon-card-gain' : 'neon-card-loss'"
      class="position-card"
  >
    <div class="pos-top" @click="router.push(`/stock/${pos.ticker}`)">
      <div>
        <span class="ticker">{{ pos.ticker }}</span>
        <span class="company text-muted">{{ pos.companyName }}</span>
      </div>
      <div class="pos-value">
        <span class="value">{{ useTickerCurrency(pos.value, pos.ticker) }}</span>
        <span :class="gainLossClass(pos.pnl)" class="pnl">
          {{ useTickerCurrency(pos.pnl, pos.ticker) }} ({{ usePercent(pos.pnlPercent) }})
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
      <Button
          v-tooltip="'View lots'"
          icon="pi pi-list"
          severity="secondary"
          size="small"
          text
          @click="router.push(`/position/${encodeURIComponent(pos.ticker)}`)"
      />
      <Button
          icon="pi pi-trash"
          severity="danger"
          size="small"
          text
          @click="emit('delete', pos)"
      />
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
  border-bottom: 1px solid var(--border);
  gap: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
}

.compact-row:active {
  background: rgba(255, 255, 255, 0.03);
}

.neon-row-gain {
  border-left: 3px solid rgba(0, 195, 106, 0.7);
  padding-left: 0.5rem;
}

.neon-row-loss {
  border-left: 3px solid rgba(224, 45, 74, 0.7);
  padding-left: 0.5rem;
}

.row-left {
  display: flex;
  flex-direction: column;
  min-width: 90px;
  flex: 0 0 90px;
}

.row-chart {
  flex: 1;
  min-width: 0;
  height: 40px;
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
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* Shared */
.ticker {
  font-weight: 700;
  font-size: 1rem;
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
  max-width: 90px;
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

.remove-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 6px;
  margin-left: 2px;
  border-radius: 50%;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.15s;
}

.remove-btn:active {
  color: var(--red);
}

.remove-btn i {
  font-size: 0.7rem;
}
</style>
