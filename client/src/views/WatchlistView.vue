<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {useStorage} from '@vueuse/core'
import {useWatchlistStore} from '@/stores/watchlist'
import {useAlertsStore} from '@/stores/alerts'
import {useChartRange} from '@/composables/useChartRange'
import {GROUP_MODES, groupItems} from '@/composables/useGrouping'
import Button from 'primevue/button'
import Select from 'primevue/select'
import AddWatchlistModal from '@/components/ui/AddWatchlistModal.vue'
import ImportModal from '@/components/ui/ImportModal.vue'
import WatchRow from '@/components/ui/WatchRow.vue'
import RangeBar from '@/components/ui/RangeBar.vue'
import PageSettings from '@/components/ui/PageSettings.vue'
import SettingsRow from '@/components/ui/SettingsRow.vue'

const watchlist = useWatchlistStore()
const alerts = useAlertsStore()
const range = useChartRange()
const showModal = ref(false)
const showImportModal = ref(false)
const groupMode = useStorage('watchlist-group-mode', 'none')

function onImported() {
  watchlist.fetchWatchlist(range.value)
}

const grouped = computed(() => groupItems(watchlist.items, groupMode.value))

onMounted(() => {
  alerts.fetchAlerts()
  watchlist.fetchWatchlist(range.value)
})
watch(range, (r) => watchlist.fetchWatchlist(r))

</script>

<template>
  <div class="watchlist safe-bottom">
    <header class="page-header">
      <h1 class="gradient-title">Watchlist</h1>
      <div class="header-actions">
        <Button
            v-tooltip.bottom="'Import from file'"
            icon="pi pi-upload"
            size="small"
            text
            @click="showImportModal = true"
        />
        <Button icon="pi pi-plus" label="Add" outlined size="small" @click="showModal = true"/>
        <PageSettings>
          <SettingsRow icon="pi pi-objects-column" label="Group by">
            <Select
                v-model="groupMode"
                :options="GROUP_MODES"
                class="group-select"
                option-label="label"
                option-value="value"
            />
          </SettingsRow>
        </PageSettings>
      </div>
    </header>

    <RangeBar class="page-range" />

    <div v-if="watchlist.loading" class="skeleton-list">
      <div v-for="n in 5" :key="n" class="skeleton-row"/>
    </div>

    <div v-else-if="!watchlist.items.length" class="empty">
      <i class="pi pi-eye" />
      <p>Your watchlist is empty</p>
      <Button label="Add Stock" @click="showModal = true" />
    </div>

    <div v-else class="watch-list">
      <template v-for="section in grouped" :key="section.group ?? '_all'">
        <div v-if="section.group" class="market-header">{{ section.group }}</div>
        <WatchRow
            v-for="item in section.items"
            :key="`${section.group ?? ''}-${item._id}`"
            :item="item"
        />
      </template>
    </div>

    <AddWatchlistModal v-model:visible="showModal" />
    <ImportModal v-model:visible="showImportModal" mode="watchlist" @imported="onImported"/>
  </div>
</template>

<style scoped>
.watchlist { padding: 1rem; }
.page-range { margin-bottom: 1rem; }

@media (min-width: 768px) {
  .watchlist {
    padding: 1.5rem;
  }
}

@media (min-width: 1280px) {
  .watchlist {
    padding: 2rem;
  }
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.page-header h1 {
  font-size: 1.5rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.market-header {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 0.6rem 0.25rem 0.3rem;
  border-bottom: 1px solid var(--border);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 4rem 1rem;
  color: var(--text-secondary);
}
.empty i { font-size: 3rem; }

.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.skeleton-row {
  height: 60px;
  background: linear-gradient(90deg, var(--bg-card) 25%, #1a1a1a 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-bottom: 1px solid var(--border);
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.watch-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}

.toggle-group {
  display: flex;
  gap: 0.25rem;
}

.toggle-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.toggle-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.group-select {
  min-width: 110px;
}

.group-select :deep(.p-select-label) {
  padding: 4px 8px;
  font-size: 0.8rem;
}
</style>
