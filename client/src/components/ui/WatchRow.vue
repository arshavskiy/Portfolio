<script setup>
import {computed} from 'vue'
import {useRouter} from 'vue-router'
import {usePercent, useTickerCurrency} from '@/composables/useFormat'
import {useAlertsStore} from '@/stores/alerts'
import SparklineChart from '@/components/charts/SparklineChart.vue'

const props = defineProps({
  item: {type: Object, required: true},
})
const emit = defineEmits(['remove'])
const router = useRouter()
const alerts = useAlertsStore()

// Active price alerts on this ticker → drives the bell indicator.
const activeAlerts = computed(() =>
    alerts.forTicker(props.item.ticker).filter((a) => a.active).length
)
</script>

<template>
  <div class="watch-row" @click="router.push(`/stock/${item.ticker}`)">
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
    </div>

    <div class="row-chart">
      <SparklineChart
          v-if="item.history?.length"
          :data="item.history"
          :pnl-percent="item.changePercent"
      />
    </div>

    <div class="row-right">
      <span class="price">{{ useTickerCurrency(item.price, item.ticker) }}</span>
      <span :class="item.changePercent >= 0 ? 'badge-gain' : 'badge-loss'" class="badge">
        {{ usePercent(item.changePercent) }}
      </span>
    </div>

    <button class="remove-btn" @click.stop="emit('remove', item)">
      <i class="pi pi-times"/>
    </button>
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
  min-width: 90px;
  flex: 0 0 90px;
}

.ticker {
  font-size: 1rem;
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
  max-width: 90px;
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
