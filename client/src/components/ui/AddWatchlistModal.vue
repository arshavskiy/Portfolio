<script setup>
import {ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useWatchlistStore} from '@/stores/watchlist'
import {MARKETS, useMarketSuffix} from '@/composables/useMarketSuffix'
import api from '@/composables/useApi'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import AutoComplete from 'primevue/autocomplete'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['update:visible'])

const toast = useToast()
const watchlist = useWatchlistStore()
const {suffix: marketSuffix, selected: selectedMarket, applyTo, searchQuery} = useMarketSuffix('watchlist-add-market')

const ticker = ref('')
const suggestions = ref([])
const loading = ref(false)

watch(() => props.visible, (v) => { if (v) ticker.value = '' })

async function searchTicker(event) {
  const q = searchQuery(event.query || '')
  if (!q) {
    suggestions.value = [];
    return
  }
  try {
    const results = await api.get(`/stocks/search?q=${encodeURIComponent(q)}`)
    suggestions.value = results.map((r) => ({ label: `${r.ticker} — ${r.name}`, value: r.ticker, name: r.name }))
  } catch { suggestions.value = [] }
}

async function submit() {
  let t = typeof ticker.value === 'object' ? ticker.value.value : ticker.value
  const name = typeof ticker.value === 'object' ? ticker.value.name : ''
  if (!t) { toast.add({ severity: 'warn', summary: 'Enter a ticker', life: 2000 }); return }

  t = applyTo(t)
  loading.value = true
  try {
    await watchlist.addItem(t, name)
    toast.add({ severity: 'success', summary: `${t} added to watchlist`, life: 2000 })
    emit('update:visible', false)
  } catch (err) {
    toast.add({ severity: 'error', summary: err.message, life: 3000 })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    modal
    header="Add to Watchlist"
    :style="{ width: '95vw', maxWidth: '380px' }"
    :draggable="false"
  >
    <div class="form">
      <!-- Market selector -->
      <div class="field">
        <label>Market</label>
        <div class="market-grid">
          <button
              v-for="m in MARKETS"
              :key="m.value"
              :class="{ active: marketSuffix === m.value }"
              class="market-chip"
              @click="marketSuffix = m.value; ticker = ''"
          >
            {{ m.label }}
          </button>
        </div>
      </div>

      <!-- Ticker search -->
      <div class="field">
        <label>Search ticker or company</label>
        <AutoComplete
          v-model="ticker"
          :suggestions="suggestions"
          option-label="label"
          @complete="searchTicker"
          :placeholder="selectedMarket.placeholder"
          fluid
          force-selection
        />
        <span v-if="marketSuffix" class="suffix-hint">
          Suffix <code>{{ marketSuffix }}</code> will be appended automatically
        </span>
      </div>

      <Button label="Add to Watchlist" :loading="loading" fluid @click="submit" />
    </div>
  </Dialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label { font-size: 0.85rem; color: var(--text-secondary); }

.market-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.market-chip {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 20px;
  padding: 4px 10px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.market-chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.suffix-hint {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.suffix-hint code {
  color: var(--accent);
  font-family: monospace;
}
</style>
