<script setup>
import {ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useWatchlistStore} from '@/stores/watchlist'
import api from '@/composables/useApi'

const props = defineProps({
  modelValue: {type: String, default: ''}, // filters the existing watchlist as you type
})
const emit = defineEmits(['update:modelValue'])

const watchlist = useWatchlistStore()
const toast = useToast()

const addResults = ref([])
const addLoading = ref(false)
const addingTicker = ref(null)
let debounceTimer = null

function alreadyWatched(ticker) {
  return watchlist.items.some((i) => i.ticker.toUpperCase() === ticker.toUpperCase())
}

async function runAddSearch(q) {
  addLoading.value = true
  try {
    addResults.value = await api.get(`/stocks/search?q=${encodeURIComponent(q.trim())}`)
  } catch {
    addResults.value = []
  } finally {
    addLoading.value = false
  }
}

// The same query filters the local list (instantly, via v-model in the
// parent) and — debounced — searches Yahoo for new tickers to add, in case
// what you typed isn't already on the watchlist.
watch(() => props.modelValue, (q) => {
  clearTimeout(debounceTimer)
  if (!q.trim()) {
    addResults.value = []
    addLoading.value = false
    return
  }
  addLoading.value = true
  debounceTimer = setTimeout(() => runAddSearch(q), 300)
})

async function add(result) {
  if (alreadyWatched(result.ticker)) return
  addingTicker.value = result.ticker
  try {
    await watchlist.addItem(result.ticker, result.name)
    toast.add({severity: 'success', summary: `${result.ticker} added to watchlist`, life: 2000})
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  } finally {
    addingTicker.value = null
  }
}

function clear() {
  emit('update:modelValue', '')
  addResults.value = []
}
</script>

<template>
  <div class="watch-search">
    <div class="search-box">
      <i class="pi pi-search search-icon"/>
      <input
          :value="modelValue"
          class="search-input"
          placeholder="Filter watchlist or search to add…"
          type="text"
          @input="emit('update:modelValue', $event.target.value)"
      >
      <button v-if="modelValue" class="clear-btn" @click="clear">
        <i class="pi pi-times"/>
      </button>
    </div>

    <!-- Results not already on the watchlist — quick-add from Yahoo search -->
    <div v-if="modelValue && (addLoading || addResults.some((r) => !alreadyWatched(r.ticker)))" class="add-results">
      <div v-if="addLoading" class="add-results-state">Searching…</div>
      <template v-else>
        <div
            v-for="r in addResults.filter((r) => !alreadyWatched(r.ticker))"
            :key="r.ticker"
            class="add-row"
        >
          <div class="add-info">
            <span class="add-ticker">{{ r.ticker }}</span>
            <span class="add-name text-muted">{{ r.name }}</span>
          </div>
          <button
              :disabled="addingTicker === r.ticker"
              class="add-btn"
              @click="add(r)"
          >
            <i v-if="addingTicker === r.ticker" class="pi pi-spin pi-spinner"/>
            <i v-else class="pi pi-plus"/>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.watch-search {
  margin-bottom: 1rem;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0 0.75rem;
  height: 42px;
}

.search-icon {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 0.9rem;
  height: 100%;
}

.search-input::placeholder {
  color: var(--text-secondary);
}

.clear-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 4px;
}

.add-results {
  margin-top: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.add-results-state {
  padding: 0.85rem 1rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-align: center;
}

.add-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid var(--border);
}

.add-row:last-child {
  border-bottom: none;
}

.add-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.add-ticker {
  font-weight: 700;
  font-size: 0.88rem;
}

.add-name {
  font-size: 0.76rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1px solid var(--accent);
  color: var(--accent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.add-btn:active {
  background: var(--accent);
  color: #fff;
}

.add-btn:disabled {
  opacity: 0.7;
}
</style>
