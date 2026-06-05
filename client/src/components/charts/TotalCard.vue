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
  position: relative;
  overflow: hidden;
  border: 1px solid var(--accent);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  height: 100%;
  background: var(--bg-card);
}

.total-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 42%);
  pointer-events: none;
}

.total-row {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.total-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  flex: 0 0 auto;
}

.total-values {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  min-width: 0;
}

.total-value {
  font-size: 1.15rem;
  font-weight: 700;
  max-width: 100%;
  overflow-wrap: anywhere;
  text-align: right;
}

.total-converted {
  font-size: 0.78rem;
  max-width: 100%;
  overflow-wrap: anywhere;
  text-align: right;
}

.total-pnl {
  font-size: 0.88rem;
  font-weight: 600;
  text-align: right;
  margin-left: auto;
  overflow-wrap: anywhere;
}

.total-day {
  font-size: 0.85rem;
  font-weight: 500;
  text-align: right;
  overflow-wrap: anywhere;
}

.today-label {
  font-size: 0.78rem;
}
</style>
