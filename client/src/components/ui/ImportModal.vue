<script setup>
import {computed, ref} from 'vue'
import {useToast} from 'primevue/usetoast'
import {usePortfolioStore} from '@/stores/portfolio'
import {useWatchlistStore} from '@/stores/watchlist'
import {autoMap, downloadTemplate, mapRows, parseFile} from '@/composables/useImport'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'

const props = defineProps({
  visible: Boolean,
  mode: {type: String, default: 'watchlist'}, // 'watchlist' | 'holdings'
})
const emit = defineEmits(['update:visible', 'imported'])

const toast = useToast()
const portfolio = usePortfolioStore()
const watchlist = useWatchlistStore()

const fileInput = ref(null)
const fileName = ref('')
const headers = ref([])
const rawRows = ref([])
const map = ref({})
const parsing = ref(false)
const importing = ref(false)
const progress = ref(0)
const result = ref(null) // { ok, failed }

const isHoldings = computed(() => props.mode === 'holdings')
const title = computed(() => (isHoldings.value ? 'Import Holdings' : 'Import Watchlist'))

// Fields the user can map, per mode.
const fields = computed(() =>
    isHoldings.value
        ? [
          {key: 'ticker', label: 'Ticker', required: true},
          {key: 'shares', label: 'Shares', required: true},
          {key: 'price', label: 'Price', required: true},
          {key: 'date', label: 'Date', required: false},
          {key: 'companyName', label: 'Company', required: false},
          {key: 'groups', label: 'Groups', required: false},
        ]
        : [
          {key: 'ticker', label: 'Ticker', required: true},
          {key: 'companyName', label: 'Company', required: false},
        ]
)

const headerOptions = computed(() => [
  {label: '— none —', value: null},
  ...headers.value.map((h) => ({label: h, value: h})),
])

const mappedRows = computed(() => mapRows(rawRows.value, map.value, props.mode))
const validCount = computed(() => mappedRows.value.filter((r) => r.valid).length)
const canImport = computed(() =>
    validCount.value > 0 && fields.value.filter((f) => f.required).every((f) => map.value[f.key])
)

function reset() {
  fileName.value = ''
  headers.value = []
  rawRows.value = []
  map.value = {}
  progress.value = 0
  result.value = null
}

function pickFile() {
  fileInput.value?.click()
}

async function onFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  reset()
  fileName.value = file.name
  parsing.value = true
  try {
    const {headers: hs, rows} = await parseFile(file)
    if (!rows.length) throw new Error('No data rows found in the file.')
    headers.value = hs
    rawRows.value = rows
    map.value = autoMap(hs)
  } catch (err) {
    toast.add({severity: 'error', summary: 'Could not read file', detail: err.message, life: 4000})
    reset()
  } finally {
    parsing.value = false
    if (e.target) e.target.value = '' // allow re-picking the same file
  }
}

async function runImport() {
  const rows = mappedRows.value.filter((r) => r.valid)
  if (!rows.length) return
  importing.value = true
  progress.value = 0
  let ok = 0
  let failed = 0

  for (const r of rows) {
    try {
      if (isHoldings.value) {
        await portfolio.addTransaction({
          ticker: r.ticker,
          type: 'buy',
          shares: r.shares,
          price: r.price,
          date: r.date ? new Date(r.date) : new Date(),
          groups: r.groups?.length ? r.groups : undefined,
        })
      } else {
        await watchlist.addItemRaw(r.ticker, r.companyName)
      }
      ok++
    } catch {
      failed++
    }
    progress.value = Math.round(((ok + failed) / rows.length) * 100)
  }

  if (!isHoldings.value) await watchlist.refresh().catch(() => {
  })
  importing.value = false
  result.value = {ok, failed}
  toast.add({
    severity: failed ? 'warn' : 'success',
    summary: `Imported ${ok} of ${rows.length}`,
    detail: failed ? `${failed} failed (already present or invalid ticker)` : undefined,
    life: 3500,
  })
  emit('imported')
}

function close() {
  reset()
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
      :draggable="false"
      :header="title"
      :style="{ width: '95vw', maxWidth: '560px' }"
      :visible="visible"
      modal
      @update:visible="$event ? null : close()"
  >
    <div class="import">
      <input
          ref="fileInput"
          accept=".xlsx,.xls,.csv,.docx"
          class="hidden-input"
          type="file"
          @change="onFile"
      />

      <!-- File pick -->
      <template v-if="!rawRows.length">
        <div class="dropzone" @click="pickFile">
          <i class="pi pi-upload"/>
          <p>{{ parsing ? 'Reading…' : 'Tap to choose a file' }}</p>
          <span class="text-muted">.xlsx, .csv, or .docx (with a table)</span>
        </div>
        <button class="template-link" @click="downloadTemplate(mode)">
          <i class="pi pi-download"/> Download {{ isHoldings ? 'holdings' : 'watchlist' }} template
        </button>
      </template>

      <template v-else>
        <p class="file-line text-muted">
          <i class="pi pi-file"/> {{ fileName }} · {{ rawRows.length }} rows
          <button class="link" @click="pickFile">Change</button>
        </p>

        <!-- Column mapping -->
        <div class="map-grid">
          <div v-for="f in fields" :key="f.key" class="map-row">
            <label>{{ f.label }}<span v-if="f.required" class="req">*</span></label>
            <Select
                v-model="map[f.key]"
                :options="headerOptions"
                class="map-select"
                option-label="label"
                option-value="value"
                placeholder="—"
            />
          </div>
        </div>

        <!-- Preview -->
        <div class="preview">
          <div class="preview-head">
            <span>Preview</span>
            <span class="text-muted">{{ validCount }} of {{ mappedRows.length }} valid</span>
          </div>
          <div class="preview-list">
            <div
                v-for="(r, i) in mappedRows.slice(0, 50)"
                :key="i"
                :class="{ invalid: !r.valid }"
                class="preview-row"
            >
              <span class="p-ticker">{{ r.ticker || '—' }}</span>
              <span v-if="isHoldings" class="p-detail text-muted">
                {{ r.shares ?? '?' }} × {{ r.price ?? '?' }}
              </span>
              <span v-else class="p-detail text-muted">{{ r.companyName || '' }}</span>
              <span v-if="r.groups?.length" class="p-groups text-muted">{{ r.groups.join(', ') }}</span>
              <i v-if="r.valid" class="pi pi-check ok"/>
              <i v-else :title="r.error" class="pi pi-times bad"/>
            </div>
          </div>
          <p v-if="mappedRows.length > 50" class="text-muted more">+{{ mappedRows.length - 50 }} more…</p>
        </div>

        <!-- Progress -->
        <div v-if="importing" class="progress">
          <div :style="{ width: progress + '%' }" class="bar"/>
          <span>{{ progress }}%</span>
        </div>

        <Button
            :disabled="!canImport || importing"
            :label="`Import ${validCount} ${isHoldings ? 'holdings' : 'tickers'}`"
            :loading="importing"
            fluid
            outlined
            @click="runImport"
        />
      </template>
    </div>
  </Dialog>
</template>

<style scoped>
.import {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.hidden-input {
  display: none;
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2.5rem 1rem;
  border: 2px dashed var(--border);
  border-radius: 12px;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s;
}

.dropzone:active {
  border-color: var(--accent);
}

.dropzone i {
  font-size: 2rem;
  color: var(--accent);
}

.dropzone span {
  font-size: 0.78rem;
}

.template-link {
  align-self: center;
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.8rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 4px;
}

.template-link i {
  font-size: 0.75rem;
}

.file-line {
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.link {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.78rem;
  margin-left: auto;
}

.map-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.map-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.map-row label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.req {
  color: var(--neon-red);
  margin-left: 2px;
}

.map-select :deep(.p-select-label) {
  padding: 4px 8px;
  font-size: 0.8rem;
}

.preview {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.preview-head {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  font-size: 0.78rem;
  font-weight: 600;
}

.preview-list {
  max-height: 200px;
  overflow-y: auto;
}

.preview-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-top: 1px solid var(--border);
  font-size: 0.82rem;
}

.preview-row.invalid {
  opacity: 0.55;
}

.p-ticker {
  font-weight: 700;
  min-width: 64px;
}

.p-detail {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.p-groups {
  font-size: 0.7rem;
}

.ok {
  color: var(--neon-green);
}

.bad {
  color: var(--neon-red);
}

.more {
  font-size: 0.72rem;
  text-align: center;
  padding: 4px;
}

.progress {
  position: relative;
  height: 8px;
  background: var(--bg-card);
  border-radius: 4px;
  overflow: hidden;
}

.progress .bar {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--accent);
  transition: width 0.2s;
}

.progress span {
  position: absolute;
  right: 6px;
  top: -18px;
  font-size: 0.7rem;
  color: var(--text-secondary);
}
</style>
