<script setup>
import { ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useWatchlistStore } from '@/stores/watchlist'
import api from '@/composables/useApi'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import AutoComplete from 'primevue/autocomplete'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['update:visible'])

const toast = useToast()
const watchlist = useWatchlistStore()

const ticker = ref('')
const suggestions = ref([])
const loading = ref(false)

watch(() => props.visible, (v) => { if (v) ticker.value = '' })

async function searchTicker(event) {
  if (!event.query) { suggestions.value = []; return }
  try {
    const results = await api.get(`/stocks/search?q=${encodeURIComponent(event.query)}`)
    suggestions.value = results.map((r) => ({ label: `${r.ticker} — ${r.name}`, value: r.ticker, name: r.name }))
  } catch { suggestions.value = [] }
}

async function submit() {
  const t = typeof ticker.value === 'object' ? ticker.value.value : ticker.value
  const name = typeof ticker.value === 'object' ? ticker.value.name : ''
  if (!t) { toast.add({ severity: 'warn', summary: 'Enter a ticker', life: 2000 }); return }
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
      <div class="field">
        <label>Search ticker or company</label>
        <AutoComplete
          v-model="ticker"
          :suggestions="suggestions"
          option-label="label"
          @complete="searchTicker"
          placeholder="AAPL, Apple..."
          fluid
          force-selection
        />
      </div>
      <Button label="Add to Watchlist" :loading="loading" fluid @click="submit" />
    </div>
  </Dialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label { font-size: 0.85rem; color: var(--text-secondary); }
</style>
