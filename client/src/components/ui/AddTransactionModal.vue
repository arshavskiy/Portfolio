<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {usePortfolioStore} from '@/stores/portfolio'
import {useFeeProfileStore} from '@/stores/feeProfiles'
import {useGroupsStore} from '@/stores/groups'
import {tickerCurrency, useCurrency} from '@/composables/useFormat'
import {MARKETS, useMarketSuffix} from '@/composables/useMarketSuffix'
import api from '@/composables/useApi'
import {fetchCachedQuote} from '@/composables/useQuoteCache'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import SelectButton from 'primevue/selectbutton'
import Select from 'primevue/select'
import Button from 'primevue/button'
import AutoComplete from 'primevue/autocomplete'

const props = defineProps({
  visible: Boolean,
  defaultTicker: { type: String, default: '' },
  defaultType: {type: String, default: 'buy'},     // 'buy' | 'sell'
  defaultPrice: {type: Number, default: null},      // prefill price (e.g. current price for a sell)
  maxShares: {type: Number, default: null},         // cap shares when selling a known position
})
const emit = defineEmits(['update:visible', 'hide'])

const toast = useToast()
const portfolio = usePortfolioStore()
const feeStore = useFeeProfileStore()
const groupsStore = useGroupsStore()
const {suffix: marketSuffix, selected: selectedMarket, applyTo, searchQuery} = useMarketSuffix('tx-add-market')

const type = ref('buy')
const ticker = ref('')
const shares = ref(null)
const price = ref(null)
const date = ref(new Date())
const notes = ref('')
const selectedFeeProfile = ref(null)
const loading = ref(false)
const suggestions = ref([])
const groups = ref([])              // selected group tags (array of strings)
const groupSuggestions = ref([])    // filtered existing tags for the dropdown
const pendingGroup = ref('')        // raw text typed but not yet committed
const marketPrice = ref(null)       // live quote price for the current ticker
const fetchingPrice = ref(false)

const currentTicker = computed(() => {
  const raw = typeof ticker.value === 'object' ? ticker.value.value : ticker.value
  return (raw || '').split(' — ')[0].trim().toUpperCase()
})
const txCurrency = computed(() => {
  if (currentTicker.value) return tickerCurrency(currentTicker.value)
  return marketSuffix.value === '.TA' ? 'ILS' : 'USD'
})
const currency = computed(() => txCurrency.value)
const currencySymbol = computed(() => txCurrency.value === 'ILS' ? '₪' : '$')
// Crypto if the selected market chip is crypto OR the typed ticker already ends in -USD.
const isCryptoBuy = computed(() => marketSuffix.value === '-USD' || /-USD$/i.test(currentTicker.value))
const shareDigits = computed(() => isCryptoBuy.value ? 8 : 4)

function defaultFeeProfile() {
  const profiles = feeStore.profiles
  return profiles.find((p) => p.isDefault) || (profiles.length === 1 ? profiles[0] : null)
}

const matchingProfiles = computed(() => feeStore.profiles)

function formatFeePercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0%'
  return `${(num * 100).toFixed(3).replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '')}%`
}

function formatTaxPercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0%'
  return `${num.toFixed(3).replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '')}%`
}

const feeOptions = computed(() => [
  { label: 'No fee', value: null },
  ...matchingProfiles.value.map((p) => {
    const fee = type.value === 'buy' ? p.buyFee : p.sellFee
    const feeStr = fee?.value ? (fee.type === 'percent' ? formatFeePercent(fee.value) : fee.value) : '0%'
    const taxStr = p.capitalGainsTax ? ` · Tax ${formatTaxPercent(p.capitalGainsTax)}` : ''
    return { label: `${p.name} (${feeStr}${taxStr})`, value: p._id, profile: p }
  }),
])

function calcFee(rule, total) {
  if (!rule || !rule.value) return 0
  let fee = rule.type === 'percent' ? total * rule.value : rule.value
  if (rule.minFee && fee < rule.minFee) fee = rule.minFee
  return Math.round(fee * 100) / 100
}

const selectedProfile = computed(() => {
  if (!selectedFeeProfile.value) return null
  return feeStore.profiles.find((p) => p._id === selectedFeeProfile.value) || null
})

const feeAmount = computed(() => {
  if (!selectedProfile.value || !shares.value || !price.value) return 0
  const total = shares.value * price.value
  const rule = type.value === 'buy' ? selectedProfile.value.buyFee : selectedProfile.value.sellFee
  return calcFee(rule, total)
})
const feeCurrency = computed(() => txCurrency.value)

// Capital gains tax estimate (sell only) — uses a placeholder avg cost of 0 if unknown
const taxAmount = computed(() => {
  if (type.value !== 'sell' || !selectedProfile.value?.capitalGainsTax) return 0
  if (!shares.value || !price.value) return 0
  // Frontend can't know avgCost here — show estimated tax on full proceeds as worst case
  // Server will compute exact tax using real avgCost
  return 0
})

onMounted(() => { if (!feeStore.profiles.length) feeStore.fetchProfiles() })

watch(() => props.visible, async (v) => {
  if (v) {
    ticker.value = props.defaultTicker || ''
    shares.value = null
    price.value = props.defaultPrice ?? null
    date.value = new Date()
    notes.value = ''
    groups.value = []
    type.value = props.defaultType === 'sell' ? 'sell' : 'buy'
    selectedFeeProfile.value = defaultFeeProfile()?._id || null
    groupsStore.fetchGroups()
    if (props.defaultTicker && price.value == null) {
      await fetchMarketPrice()
      if (marketPrice.value != null) price.value = marketPrice.value
    }
  }
})

watch(() => feeStore.profiles, (profiles) => {
  if (!profiles.some((p) => p._id === selectedFeeProfile.value)) {
    selectedFeeProfile.value = defaultFeeProfile()?._id || null
  }
}, { immediate: true })

// Fetch the live market price for the current ticker for quick-fill actions.
async function fetchMarketPrice() {
  marketPrice.value = null
  const t = currentTicker.value
  if (!t) return
  fetchingPrice.value = true
  try {
    const q = await fetchCachedQuote(t)
    marketPrice.value = q?.price ?? null
  } catch {
    marketPrice.value = null
  } finally {
    fetchingPrice.value = false
  }
}

function useMarketPrice() {
  if (marketPrice.value != null) price.value = marketPrice.value
}

async function sellAllAtMarket() {
  if (type.value !== 'sell' || !props.maxShares) return
  shares.value = props.maxShares
  if (marketPrice.value == null) await fetchMarketPrice()
  const latestPrice = marketPrice.value ?? props.defaultPrice
  if (latestPrice == null) {
    toast.add({ severity: 'warn', summary: 'Market price unavailable', life: 2000 })
    return
  }
  price.value = latestPrice
}

// Prefetch the live quote for the current ticker so buy/sell can offer a
// market-price quick action.
watch(currentTicker, (t) => {
  if (t) fetchMarketPrice()
  else marketPrice.value = null
})

async function searchTicker(event) {
  const raw = event.query?.trim() || ''
  // If the user typed a crypto pair directly (e.g. BTC-USD), search it as-is;
  // otherwise apply the selected market chip's suffix.
  const q = /-USD$/i.test(raw) ? raw : searchQuery(raw)
  if (!q) {
    suggestions.value = [];
    return
  }
  try {
    const results = await api.get(`/stocks/search?q=${encodeURIComponent(q)}`)
    suggestions.value = results.map((r) => `${r.ticker} — ${r.name}`)
  } catch { suggestions.value = [] }
}

// Suggest existing tags that match what's typed and aren't already selected.
function searchGroups(event) {
  pendingGroup.value = event.query || ''
  const q = pendingGroup.value.trim().toLowerCase()
  const selected = new Set(groups.value.map((g) => g.toLowerCase()))
  groupSuggestions.value = groupsStore.tags.filter(
      (t) => !selected.has(t.toLowerCase()) && t.toLowerCase().includes(q)
  )
}

// Commit the currently-typed text as a new tag. Used on Enter + flushed on submit.
function commitPendingGroup() {
  const val = pendingGroup.value.trim().slice(0, 30)
  pendingGroup.value = ''
  groupSuggestions.value = []
  if (!val) return
  if (groups.value.some((g) => g.toLowerCase() === val.toLowerCase())) return
  groups.value = [...groups.value, val]
}

// PrimeVue's multiple AutoComplete only adds *selected* suggestions, not free text.
function addTypedGroup(event) {
  if (pendingGroup.value.trim()) {
    event.preventDefault()
    commitPendingGroup()
  }
}


async function submit() {
  if (type.value === 'buy') commitPendingGroup() // flush un-Entered group text
  const raw = typeof ticker.value === 'object' ? ticker.value.value : ticker.value
  const t = applyTo((raw || '').split(' — ')[0].trim().toUpperCase())

  // Crypto buy with no price → fall back to the live market price.
  let effectivePrice = price.value
  if (!effectivePrice && type.value === 'buy' && isCryptoBuy.value) {
    if (marketPrice.value == null) await fetchMarketPrice()
    effectivePrice = marketPrice.value
    if (effectivePrice != null) price.value = effectivePrice
  }

  if (!t || !shares.value || !effectivePrice) {
    toast.add({ severity: 'warn', summary: 'Fill all fields', life: 2000 })
    return
  }
  loading.value = true
  try {
    await portfolio.addTransaction({
      ticker: t,
      type: type.value,
      shares: shares.value,
      price: effectivePrice,
      date: date.value,
      notes: notes.value || undefined,
      feeProfileId: selectedFeeProfile.value ?? null,
      groups: type.value === 'buy' && groups.value.length ? groups.value : undefined,
    })
    toast.add({ severity: 'success', summary: `${type.value === 'buy' ? 'Bought' : 'Sold'} ${t}`, life: 2000 })
    emit('update:visible', false)
    emit('hide')
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: err.message, life: 3000 })
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
    :header="type === 'buy' ? 'Buy Stock' : 'Sell Stock'"
    :style="{ width: '95vw', maxWidth: '420px' }"
    :draggable="false"
  >
    <div class="tx-form">
      <SelectButton v-model="type" :options="['buy', 'sell']" class="type-select"/>

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

      <div class="field">
        <label>{{ isCryptoBuy ? 'Coin' : 'Ticker' }}</label>
        <AutoComplete
          v-model="ticker"
          :suggestions="suggestions"
          @complete="searchTicker"
          @item-select="(e) => { ticker = e.value.split(' — ')[0].trim() }"
          :placeholder="selectedMarket.placeholder"
          :delay="300"
          fluid
        />
        <span v-if="marketSuffix" class="suffix-hint">
          Suffix <code>{{ marketSuffix }}</code> will be appended automatically
        </span>
      </div>

      <div class="fields-row">
        <div class="field">
          <label>
            <span>{{ isCryptoBuy ? 'Amount' : 'Shares' }}</span>
            <button
                v-if="type === 'sell' && maxShares"
                class="max-link"
                type="button"
                @click="shares = maxShares"
            >Max {{ maxShares }}
            </button>
          </label>
          <InputNumber v-model="shares" :max="type === 'sell' && maxShares ? maxShares : undefined"
                       :max-fraction-digits="shareDigits"
                       :min="0" :step="isCryptoBuy ? 0.0001 : 1" fluid placeholder="0"/>
        </div>
        <div class="field">
          <label>
            <span>{{ isCryptoBuy ? 'Price per coin' : 'Price per share' }}</span>
            <button
                v-if="marketPrice != null"
                class="max-link"
                type="button"
                @click="useMarketPrice"
            >Market {{ currencySymbol }}{{ marketPrice < 1 ? marketPrice.toFixed(6) : marketPrice.toFixed(2) }}</button>
            <span v-else-if="fetchingPrice" class="max-link" style="opacity:0.5;cursor:default">Fetching…</span>
          </label>
          <InputNumber v-model="price" mode="currency" :currency="currency" :min="0" :max-fraction-digits="shareDigits"
                       :placeholder="isCryptoBuy && type === 'buy' ? 'Market price' : `${currencySymbol}0.00`" fluid />
          <span v-if="isCryptoBuy && type === 'buy' && !price" class="suffix-hint">
            Leave empty to buy at the current market price
          </span>
        </div>
      </div>

      <button
          v-if="type === 'sell' && maxShares"
          class="sell-all-market"
          type="button"
          :disabled="fetchingPrice"
          @click="sellAllAtMarket"
      >
        <i class="pi pi-bolt"/>
        <span>{{ fetchingPrice ? 'Loading market price...' : 'Sell all at market price' }}</span>
      </button>

      <div class="field">
        <label>Date</label>
        <DatePicker v-model="date" :max-date="new Date()" date-format="dd/mm/yy" show-icon fluid />
      </div>

      <div v-if="type === 'buy'" class="field">
        <label>Groups <span class="text-muted">(optional)</span></label>
        <AutoComplete
            v-model="groups"
            :suggestions="groupSuggestions"
            :typeahead="false"
            complete-on-focus
            fluid
            multiple
            placeholder="Tech, Long-term…"
            @complete="searchGroups"
            @input="pendingGroup = $event.target ? $event.target.value : pendingGroup"
            @keydown.enter="addTypedGroup"
        />
        <span class="text-muted hint">Type a name + Enter to create, or pick an existing one</span>
      </div>

      <div class="field">
        <label>Brokerage fee</label>
        <Select
          v-model="selectedFeeProfile"
          :options="feeOptions"
          option-label="label"
          option-value="value"
          placeholder="No fee"
          fluid
        />
      </div>

      <div class="field">
        <label>Notes <span class="text-muted">(optional)</span></label>
        <InputText v-model="notes" placeholder="e.g. dividend reinvestment" fluid />
      </div>

      <div class="total-row">
        <div class="total-line">
          <span class="text-muted">Subtotal</span>
          <span>{{ currencySymbol }}{{ ((shares || 0) * (price || 0)).toFixed(2) }}</span>
        </div>
        <div v-if="feeAmount > 0" class="total-line fee-line">
          <span class="text-muted">{{ type === 'buy' ? 'Buy' : 'Sell' }} fee</span>
          <span class="loss">{{ type === 'buy' ? '+' : '-' }}{{ useCurrency(feeAmount, feeCurrency) }}</span>
        </div>
        <div v-if="type === 'sell' && selectedProfile?.capitalGainsTax" class="total-line fee-line">
          <span class="text-muted">Capital gains tax ({{ formatTaxPercent(selectedProfile.capitalGainsTax) }})</span>
          <span class="loss">calculated on profit at sell</span>
        </div>
        <div class="total-line total-final">
          <span>{{ type === 'buy' ? 'Total cost' : 'Net proceeds' }}</span>
          <span class="total-amount">
            {{ currencySymbol }}{{ type === 'buy'
              ? ((((shares || 0) * (price || 0)) + feeAmount).toFixed(2))
              : ((((shares || 0) * (price || 0)) - feeAmount).toFixed(2)) }}
            <span v-if="type === 'sell' && selectedProfile?.capitalGainsTax" class="text-muted" style="font-size:0.75rem"> (before tax)</span>
          </span>
        </div>
      </div>

      <div class="action-row">
        <Button
            :label="type === 'buy' ? 'Buy' : 'Sell'"
            :loading="loading"
            :severity="type === 'buy' ? 'success' : 'danger'"
            class="submit-btn"
            @click="submit"
        />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.tx-form { display: flex; flex-direction: column; gap: 1rem; }
.type-select { align-self: center; }

.action-row {
  display: flex;
  gap: 0.5rem;
}

.action-row .submit-btn {
  flex: 1;
}
.fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }

.field label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.field label > span:first-child {
  flex: 1;
  min-width: 0;
  line-height: 1.15;
}

.max-link {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  line-height: 1.1;
  text-align: right;
  flex-shrink: 0;
}

.sell-all-market {
  width: 100%;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  border-radius: 8px;
  padding: 0.65rem 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.sell-all-market:disabled {
  opacity: 0.65;
  cursor: wait;
}

.hint {
  font-size: 0.72rem;
}
.total-row { display: flex; flex-direction: column; gap: 4px; padding: 0.75rem; border-radius: 8px; background: rgba(255,255,255,0.04); font-size: 0.9rem; }
.total-line { display: flex; justify-content: space-between; }
.fee-line { font-size: 0.82rem; }
.total-final { border-top: 1px solid var(--border); padding-top: 6px; margin-top: 2px; font-weight: 600; }
.total-amount { font-size: 1.05rem; }

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
