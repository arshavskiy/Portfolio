<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {useStorage} from '@vueuse/core'
import {useWatchlistStore} from '@/stores/watchlist'
import {useAlertsStore} from '@/stores/alerts'
import {useChartRange} from '@/composables/useChartRange'
import {groupItems} from '@/composables/useGrouping'
import Button from 'primevue/button'
import AddWatchlistModal from '@/components/ui/AddWatchlistModal.vue'
import ImportModal from '@/components/ui/ImportModal.vue'
import WatchRow from '@/components/ui/WatchRow.vue'
import RangeBar from '@/components/ui/RangeBar.vue'
import GroupModeBar from '@/components/ui/GroupModeBar.vue'
import GroupEditModal from '@/components/ui/GroupEditModal.vue'

const watchlist = useWatchlistStore()
const alerts = useAlertsStore()
const range = useChartRange()
const showModal = ref(false)
const showImportModal = ref(false)
const showGroupModal = ref(false)
const groupItem = ref(null)
const groupMode = useStorage('watchlist-group-mode', 'sector')
const now = ref(new Date())
let marketTimer = null

function onImported() {
  watchlist.fetchWatchlist(range.value)
}

const grouped = computed(() => groupItems(watchlist.items, groupMode.value, now.value))

onMounted(() => {
  alerts.fetchAlerts()
  watchlist.fetchWatchlist(range.value)
  marketTimer = setInterval(() => {
    now.value = new Date()
  }, 60000)
})
watch(range, (r) => watchlist.fetchWatchlist(r))

onUnmounted(() => {
  if (marketTimer) clearInterval(marketTimer)
})

function openGroups(item) {
  groupItem.value = item
  showGroupModal.value = true
}

function onGroupsSaved() {
  watchlist.fetchWatchlist(range.value)
}

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
        <Button label="Add" outlined size="small" @click="showModal = true"/>
      </div>
    </header>

    <RangeBar class="page-range" />
    <GroupModeBar v-model="groupMode" class="page-group-mode" />

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
            @edit-groups="openGroups"
        />
      </template>
    </div>

    <AddWatchlistModal v-model:visible="showModal" />
    <ImportModal v-model:visible="showImportModal" mode="watchlist" @imported="onImported"/>
    <GroupEditModal
      v-model:visible="showGroupModal"
      :item="groupItem"
      mode="watchlist"
      @saved="onGroupsSaved"
    />
  </div>
</template>

<style scoped>
.watchlist { padding: 1rem; }
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
  color: transparent;
  background: linear-gradient(90deg, var(--neon-blue), #7dd3fc 45%, var(--neon-green));
  -webkit-background-clip: text;
  background-clip: text;
  padding: 0.6rem 0.25rem 0.3rem;
  border-bottom: 1px solid rgba(0, 207, 255, 0.18);
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

.page-group-mode {
  margin-bottom: 1rem;
}
</style>
