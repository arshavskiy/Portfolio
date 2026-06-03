<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useWatchlistStore } from '@/stores/watchlist'
import { useTickerCurrency, usePercent, gainLossClass } from '@/composables/useFormat'
import Button from 'primevue/button'
import AddWatchlistModal from '@/components/ui/AddWatchlistModal.vue'

const router = useRouter()
const toast = useToast()
const watchlist = useWatchlistStore()
const showModal = ref(false)

onMounted(() => watchlist.fetchWatchlist())

async function remove(item) {
  await watchlist.removeItem(item._id)
  toast.add({ severity: 'success', summary: 'Removed from watchlist', life: 2000 })
}
</script>

<template>
  <div class="watchlist">
    <header class="page-header">
      <h1 class="gradient-title">Watchlist</h1>
      <Button icon="pi pi-plus" label="Add" size="small" @click="showModal = true" />
    </header>

    <div v-if="watchlist.loading" class="text-muted">Loading...</div>

    <div v-else-if="!watchlist.items.length" class="empty">
      <i class="pi pi-eye" />
      <p>Your watchlist is empty</p>
      <Button label="Add Stock" @click="showModal = true" />
    </div>

    <div v-else class="watch-list">
      <div
        v-for="item in watchlist.items"
        :key="item._id"
        class="watch-item"
        :class="item.changePercent >= 0 ? 'neon-card-gain' : 'neon-card-loss'"
      >
        <div class="watch-info" @click="router.push(`/stock/${item.ticker}`)">
          <span class="ticker">{{ item.ticker }}</span>
          <span class="company text-muted">{{ item.companyName }}</span>
        </div>
        <div class="watch-quote" @click="router.push(`/stock/${item.ticker}`)">
          <span class="price">{{ useTickerCurrency(item.price, item.ticker) }}</span>
          <span :class="gainLossClass(item.changePercent)" class="change">
            {{ usePercent(item.changePercent) }}
          </span>
        </div>
        <Button icon="pi pi-times" text rounded size="small" severity="secondary" @click="remove(item)" />
      </div>
    </div>

    <AddWatchlistModal v-model:visible="showModal" />
  </div>
</template>

<style scoped>
.watchlist { padding: 1rem; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.page-header h1 { font-size: 1.5rem; font-weight: 700; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3rem 1rem; color: var(--text-secondary); }
.empty i { font-size: 3rem; }
.watch-list { display: flex; flex-direction: column; gap: 0.5rem; }
.watch-item {
  display: flex; align-items: center; padding: 0.85rem 1rem;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 12px; gap: 0.5rem; transition: box-shadow 0.2s;
}
.watch-info { flex: 1; cursor: pointer; }
.ticker { font-weight: 600; display: block; }
.company { font-size: 0.8rem; }
.watch-quote { text-align: right; cursor: pointer; min-width: 80px; }
.price { display: block; font-size: 0.95rem; }
.change { font-size: 0.8rem; }
</style>
