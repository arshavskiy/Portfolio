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
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  margin: 0.25rem 0 0.75rem;
}

.totals-grid > :only-child {
  grid-column: 1 / -1;
}

@media (min-width: 768px) {
  .totals-grid {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
}
</style>
