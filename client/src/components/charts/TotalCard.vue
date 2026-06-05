<script setup>
import {gainLossClass, useCurrency, usePercent} from '@/composables/useFormat'

defineProps({
  total: {type: Object, required: true},
  combinedUsd: {type: Object, default: null},
})
</script>

<template>
  <div class="total-card">
    <div class="total-row">
      <span class="total-label">{{ total.currency }}</span>
      <div class="total-values">
        <span class="total-value">{{ useCurrency(total.value, total.currency) }}</span>
        <span v-if="combinedUsd?.ilsToUsd" class="total-converted text-muted">
          {{
            total.currency === 'ILS'
              ? useCurrency(total.value * combinedUsd.ilsToUsd, 'USD')
              : useCurrency(total.value / combinedUsd.ilsToUsd, 'ILS')
          }}
        </span>
      </div>
    </div>
    <div class="total-row">
      <span :class="gainLossClass(total.pnl)" class="total-pnl">
        {{ total.pnl >= 0 ? '+' : '' }}{{ useCurrency(total.pnl, total.currency) }}
        ({{ usePercent(total.pnlPercent) }})
      </span>
    </div>
    <div class="total-row">
      <span class="text-muted today-label">Today</span>
      <span :class="gainLossClass(total.dayPnl)" class="total-day">
        {{ total.dayPnl >= 0 ? '+' : '' }}{{ useCurrency(total.dayPnl, total.currency) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.total-card {
  border: 1px solid var(--accent);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.total-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.total-values {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}

.total-value {
  font-size: 1.15rem;
  font-weight: 700;
}

.total-converted {
  font-size: 0.78rem;
}

.total-pnl {
  font-size: 0.88rem;
  font-weight: 600;
  text-align: right;
}

.total-day {
  font-size: 0.85rem;
  font-weight: 500;
}

.today-label {
  font-size: 0.78rem;
}
</style>
