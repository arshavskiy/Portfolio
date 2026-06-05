<script setup>
import TotalCard from '@/components/charts/TotalCard.vue'

defineProps({
  totals: {type: Array, default: () => []},
  combinedUsd: {type: Object, default: null},
})
</script>

<template>
  <div v-if="totals.length" class="totals-grid">
    <TotalCard
      v-for="total in totals"
      :key="`total-${total.currency}`"
      :total="total"
      :combined-usd="combinedUsd"
    />
  </div>
</template>

<style scoped>
.totals-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
  gap: 0.5rem;
  margin: 0.25rem 0 0.75rem;
  align-items: stretch;
}

.totals-grid > * {
  min-width: 0;
}

.totals-grid > :deep(.total-card:only-child) {
  grid-column: 1 / -1;
}

@media (min-width: 768px) {
  .totals-grid {
    gap: 0.75rem;
  }
}
</style>
