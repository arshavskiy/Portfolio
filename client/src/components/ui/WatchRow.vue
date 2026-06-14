<script setup>
import {computed} from 'vue'
import {usePercent, useTickerCurrency} from '@/composables/useFormat'
import {useAlertsStore} from '@/stores/alerts'
import SparklineChart from '@/components/charts/SparklineChart.vue'

const props = defineProps({
  item: {type: Object, required: true},
})
const emit = defineEmits(['edit-groups', 'open-stock'])
const alerts = useAlertsStore()

// Active price alerts on this ticker → drives the bell indicator.
const activeAlerts = computed(() =>
    alerts.forTicker(props.item.ticker).filter((a) => a.active).length
)

const rangeStartPrice = computed(() => props.item.history?.[0]?.close ?? null)
const rangeEndPrice = computed(() => props.item.history?.[props.item.history.length - 1]?.close ?? null)
const rangeChangePercent = computed(() => {
  const start = rangeStartPrice.value
  const end = rangeEndPrice.value
  if (start != null && end != null && start !== 0) {
    return ((end - start) / start) * 100
  }
  return props.item.changePercent ?? null
})

const extendedChangePercent = computed(() =>
  props.item.postMarketChangePercent ?? props.item.preMarketChangePercent ?? null
)
</script>

<template>
  <div class="watch-row" @click="emit('open-stock', item)">
    <div class="row-left">
      <span class="ticker">
        {{ item.ticker }}
        <span v-if="activeAlerts" :title="`${activeAlerts} active alert${activeAlerts > 1 ? 's' : ''}`"
              class="alert-badge">
          <i class="pi pi-bell"/>
          <span v-if="activeAlerts > 1" class="alert-count">{{ activeAlerts }}</span>
        </span>
      </span>
      <span class="company text-muted">{{ item.companyName }}</span>
      <div class="group-tags compact-tags" @click.stop="emit('edit-groups', item)">
        <span v-for="g in item.groups || []" :key="g" class="group-tag">{{ g }}</span>
        <span class="group-tag add-tag">
          <i class="pi pi-plus"/><span v-if="!item.groups?.length"> Tag</span>
        </span>
      </div>
    </div>

    <div class="row-chart">
      <SparklineChart
          v-if="item.history?.length"
          :data="item.history"
      />
      <div v-if="item.history?.length" class="chart-range-labels text-muted">
        <span>{{ useTickerCurrency(rangeStartPrice, item.ticker) }}</span>
        <span>{{ useTickerCurrency(rangeEndPrice, item.ticker) }}</span>
      </div>
    </div>

    <div class="row-right">
      <span class="price">{{ useTickerCurrency(item.price, item.ticker) }}</span>
      <span :class="(rangeChangePercent ?? 0) >= 0 ? 'badge-gain' : 'badge-loss'" class="badge">
        {{ usePercent(rangeChangePercent) }}
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
</template>

<style scoped>
.watch-row {
  display: flex;
  align-items: center;
  padding: 0.75rem 0.25rem;
  border-bottom: 1px solid var(--border);
  gap: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
}

.watch-row:active {
  background: rgba(255, 255, 255, 0.03);
}

.row-left {
  display: flex;
  flex-direction: column;
  flex: 0 0 90px;
}

.ticker {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.02em;
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

.company {
  font-size: 0.72rem;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* max-width: 90px; */
}

.group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
  cursor: pointer;
  width: fit-content;
}

.compact-tags .group-tag {
  font-size: 0.55rem;
  padding: 0 5px;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
