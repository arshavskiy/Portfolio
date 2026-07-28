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
import {trackEvent} from '@/composables/useAnalytics'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import SelectButton from 'primevue/selectbutton'
import Select from 'primevue/select'
import Button from 'primevue/button'
import AutoComplete from 'primevue/autocomplete'
import FeeProfilesModal from '@/components/ui/FeeProfilesModal.vue'
import {useI18n} from '@/composables/useI18n'

const BUILTIN_FEE_PROFILES = [
  {
    _id: 'builtin:blink-plus',
    builtin: true,
    name: 'בלינק Plus',
    currency: 'USD',
    buyFee: {type: 'perShare', value: 0.01, minFee: 1.5},
    sellFee: {type: 'perShare', value: 0.01, minFee: 1.5},
    capitalGainsTax: 25,
    monthlyUsage: {transactions: 10, shares: 1000},
  },
]

const props = defineProps({
  visible: Boolean,
  defaultTicker: { type: String, default: '' },
  defaultType: {type: String, default: 'buy'},     // 'buy' | 'sell'
  defaultPrice: {type: Number, default: null},      // prefill price (e.g. current price for a sell)
  maxShares: {type: Number, default: null},         // cap shares when selling a known position
  avgCost: {type: Number, default: null},           // current position average cost for sell simulation
  totalCost: {type: Number, default: null},         // current position cost basis for sell simulation
  totalBuyFees: {type: Number, default: 0},         // current position buy fees for sell simulation
})
const emit = defineEmits(['update:visible', 'hide'])

const toast = useToast()
const portfolio = usePortfolioStore()
const {t} = useI18n()
const feeStore = useFeeProfileStore()
const groupsStore = useGroupsStore()
const showFeeModal = ref(false)
const {suffix: marketSuffix, selected: selectedMarket, applyTo, searchQuery} = useMarketSuffix('tx-add-market')

const type = ref('buy')
const txTypeOptions = computed(() => [
  {label: t('common.buy'), value: 'buy'},
  {label: t('common.sell'), value: 'sell'},
])
const ticker = ref('')
const shares = ref(null)
const price = ref(null)
const date = ref(new Date())
const notes = ref('')
const selectedFeeProfile = ref(undefined)
const transactionCostQuote = ref(null)
let transactionCostRequestId = 0
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
const hasFixedTicker = computed(() => Boolean(props.defaultTicker))
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

const matchingProfiles = computed(() => [
  ...BUILTIN_FEE_PROFILES,
  ...feeStore.profiles,
])

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
  {label: t('common.noFee'), detail: '', value: null},
  ...matchingProfiles.value.map((p) => {
    const fee = type.value === 'buy' ? p.buyFee : p.sellFee
    const feeStr = formatFeeRule(fee, p.currency || currency.value)
    const minStr = fee?.minFee ? ` ${t('feeProfiles.min')} ${useCurrency(fee.minFee, p.currency || currency.value)}` : ''
    const usageStr = p.monthlyUsage ? formatMonthlyUsage(p.monthlyUsage) : ''
    const taxStr = p.capitalGainsTax ? `${t('feeProfiles.tax')} ${formatTaxPercent(p.capitalGainsTax)}` : ''
    const presetStr = p.builtin ? t('feeProfiles.preset') : ''
    const detail = [feeStr + minStr, usageStr, taxStr].filter(Boolean).join(' · ')
    return { label: p.name, detail, meta: presetStr, value: p._id, profile: p }
  }),
])

function formatMonthlyUsage(usage) {
  const parts = []
  if (usage.transactions) parts.push(t('feeProfiles.txPerMonth', {count: usage.transactions}))
  if (usage.shares) parts.push(t('feeProfiles.sharesPerMonth', {count: usage.shares.toLocaleString()}))
  return parts.join(` ${t('feeProfiles.or')} `)
}

function formatFeeRule(rule, profileCurrency = currency.value) {
  if (!rule?.value) return '0'
  if (rule.type === 'percent') return formatFeePercent(rule.value)
  if (rule.type === 'perShare') return `${useCurrency(rule.value, profileCurrency)} / ${t('feeProfiles.share')}`
  return useCurrency(rule.value, profileCurrency)
}

function submittedTickerForPreview() {
  if (!currentTicker.value) return ''
  return hasFixedTicker.value ? currentTicker.value : applyTo(currentTicker.value)
}

function transactionCostPayload() {
  if (!shares.value || !price.value) return null
  const symbol = submittedTickerForPreview()
  const count = Number(shares.value)
  const unitPrice = Number(price.value)
  if (!count || !unitPrice) return null
  const avgCost = Number.isFinite(props.avgCost)
      ? props.avgCost
      : Number.isFinite(props.totalCost) && props.maxShares > 0
          ? props.totalCost / props.maxShares
          : null
  return {
    ticker: symbol,
    type: type.value,
    feeProfileId: selectedFeeProfile.value,
    shares: count,
    price: unitPrice,
    total: count * unitPrice,
    avgCost: type.value === 'sell' ? avgCost : null,
    currency: txCurrency.value,
  }
}

async function refreshTransactionCostQuote() {
  const payload = transactionCostPayload()
  const requestId = ++transactionCostRequestId
  if (!payload) {
    transactionCostQuote.value = null
    return
  }
  try {
    const data = await api.post('/fee-profiles/simulate', payload)
    if (requestId === transactionCostRequestId) {
      transactionCostQuote.value = {
        ...data,
        key: JSON.stringify(payload),
      }
    }
  } catch {
    if (requestId === transactionCostRequestId) transactionCostQuote.value = null
  }
}

function matchingTransactionCostQuote() {
  const payload = transactionCostPayload()
  const quote = transactionCostQuote.value
  if (!payload || !quote || quote.key !== JSON.stringify(payload)) return null
  return quote
}

const feeAmount = computed(() => matchingTransactionCostQuote()?.feeAmountForTotals || 0)
const feeCurrency = computed(() => txCurrency.value)

const sellSimulation = computed(() => {
  if (type.value !== 'sell' || !shares.value || !price.value) return null
  const costQuote = matchingTransactionCostQuote()
  if (!costQuote) return null

  const grossProceeds = shares.value * price.value
  const taxRate = costQuote.taxRate || 0
  const costBasis = Number.isFinite(props.avgCost)
      ? props.avgCost * shares.value
      : Number.isFinite(props.totalCost) && props.maxShares > 0
          ? props.totalCost * (shares.value / props.maxShares)
          : null
  const buyFeesBasis = props.maxShares > 0
      ? (props.totalBuyFees || 0) * (shares.value / props.maxShares)
      : 0
  const tax = costQuote.taxAmount || 0
  const netProceeds = grossProceeds - feeAmount.value - tax
  const invested = costBasis != null ? costBasis + buyFeesBasis : null
  const netProfit = invested != null ? netProceeds - invested : null
  const netProfitPct = invested > 0 && netProfit != null ? (netProfit / invested) * 100 : null

  return {
    grossProceeds,
    sellFee: feeAmount.value,
    taxRate,
    tax,
    netProceeds,
    costBasis,
    buyFeesBasis,
    netProfit,
    netProfitPct,
    profileName: costQuote.profileName || null,
  }
})

function fmt(value) {
  return value >= 0 ? '+' : ''
}

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
  if (selectedFeeProfile.value !== null && !profiles.some((p) => p._id === selectedFeeProfile.value)) {
    selectedFeeProfile.value = defaultFeeProfile()?._id || null
  }
}, { immediate: true })

watch(
  [
    () => props.visible,
    currentTicker,
    type,
    shares,
    price,
    selectedFeeProfile,
    txCurrency,
    () => props.avgCost,
    () => props.totalCost,
    () => props.maxShares,
  ],
  () => {
    if (props.visible) refreshTransactionCostQuote()
    else transactionCostQuote.value = null
  },
  { immediate: true },
)

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

function formatCompactPrice(value) {
  if (value == null) return ''
  const maximumFractionDigits = value < 1 ? 6 : shareDigits.value
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.value,
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value)
}

async function sellAllAtMarket() {
  if (type.value !== 'sell' || !props.maxShares) return
  shares.value = props.maxShares
  if (marketPrice.value == null) await fetchMarketPrice()
  const latestPrice = marketPrice.value ?? props.defaultPrice
  if (latestPrice == null) {
    toast.add({severity: 'warn', summary: t('transactionModal.marketPriceUnavailable'), life: 2000})
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
  const q = searchQuery(raw)
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
  const symbol = (raw || '').split(' — ')[0].trim().toUpperCase()
  const submittedTicker = hasFixedTicker.value ? symbol : applyTo(symbol)

  // Crypto buy with no price → fall back to the live market price.
  let effectivePrice = price.value
  if (!effectivePrice && type.value === 'buy' && isCryptoBuy.value) {
    if (marketPrice.value == null) await fetchMarketPrice()
    effectivePrice = marketPrice.value
    if (effectivePrice != null) price.value = effectivePrice
  }

  if (!submittedTicker || !shares.value || !effectivePrice) {
    toast.add({severity: 'warn', summary: t('transactionModal.fillAllFields'), life: 2000})
    return
  }
  loading.value = true
  try {
    await portfolio.addTransaction({
      ticker: submittedTicker,
      type: type.value,
      shares: shares.value,
      price: effectivePrice,
      date: date.value,
      notes: notes.value || undefined,
      feeProfileId: selectedFeeProfile.value ?? null,
      groups: type.value === 'buy' && groups.value.length ? groups.value : undefined,
    })
    toast.add({
      severity: 'success',
      summary: type.value === 'buy' ? t('transactionModal.bought', {ticker: submittedTicker}) : t('transactionModal.sold', {ticker: submittedTicker}),
      life: 2000
    })
    trackEvent('add_transaction', {ticker: submittedTicker, transaction_type: type.value})
    emit('update:visible', false)
    emit('hide')
  } catch (err) {
    const handledValidation = err.status >= 400 && err.status < 500
    toast.add({
      severity: handledValidation ? 'warn' : 'error',
      summary: handledValidation ? err.message : 'Error',
      detail: handledValidation ? undefined : err.message,
      life: 3000,
    })
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
    :header="type === 'buy' ? t('transactionModal.buyStock') : t('transactionModal.sellStock')"
    :style="{ width: '95vw', maxWidth: '420px' }"
    :draggable="false"
  >
    <div class="tx-form">
      <SelectButton v-model="type" :options="txTypeOptions" class="type-select" option-label="label"
                    option-value="value"/>

      <!-- Market selector -->
      <div v-if="!hasFixedTicker" class="field">
        <label>{{ t('common.market') }}</label>
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
        <label>{{ isCryptoBuy ? t('common.coin') : t('common.ticker') }}</label>
        <InputText
          v-if="hasFixedTicker"
          :model-value="currentTicker"
          disabled
          fluid
        />
        <AutoComplete
          v-else
          v-model="ticker"
          :suggestions="suggestions"
          @complete="searchTicker"
          @item-select="(e) => { ticker = e.value.split(' — ')[0].trim(); trackEvent('select_ticker', {ticker: ticker, source: 'add_transaction_search'}) }"
          :placeholder="selectedMarket.placeholder"
          :delay="300"
          fluid
        />
        <span v-if="marketSuffix && !hasFixedTicker" class="suffix-hint">
          Suffix <code>{{ marketSuffix }}</code> will be appended automatically
        </span>
      </div>

      <div class="fields-row">
        <div class="field">
          <label>
            <span>{{ isCryptoBuy ? t('common.amount') : t('common.shares') }}</span>
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
            <span>{{ isCryptoBuy ? t('transactionModal.pricePerCoin') : t('transactionModal.pricePerShare') }}</span>
            <button
                v-if="marketPrice != null"
                class="max-link"
                type="button"
                @click="useMarketPrice"
            >Market {{ formatCompactPrice(marketPrice) }}</button>
            <span v-else-if="fetchingPrice" class="max-link"
                  style="opacity:0.5;cursor:default">{{ t('transactionModal.fetching') }}</span>
          </label>
          <InputNumber v-model="price" mode="currency" :currency="currency" :min="0" :min-fraction-digits="0"
                       :max-fraction-digits="shareDigits"
                       :placeholder="isCryptoBuy && type === 'buy' ? t('transactionModal.marketPrice') : `${currencySymbol}0`"
                       fluid/>
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
        <span>{{
            fetchingPrice ? t('transactionModal.loadingMarketPrice') : t('transactionModal.sellAllMarket')
          }}</span>
      </button>

      <div class="field">
        <label>{{ t('common.date') }}</label>
        <DatePicker v-model="date" :max-date="new Date()" date-format="dd/mm/yy" show-icon fluid />
      </div>

      <div v-if="type === 'buy'" class="field">
        <label>{{ t('common.groups') }} <span class="text-muted">({{ t('common.optional') }})</span></label>
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
        <span class="text-muted hint">{{ t('transactionModal.typeGroupHint') }}</span>
      </div>

      <div class="field">
        <label><span>{{ t('transactionModal.brokerageFee') }} <i
            v-tooltip.focus.top="t('transactionModal.brokerageFeeHelp')" class="pi pi-info-circle info-icon"
            tabindex="0"/></span></label>
        <Select
          v-if="feeOptions.length > 1"
          v-model="selectedFeeProfile"
          :options="feeOptions"
          option-label="label"
          option-value="value"
          :placeholder="t('common.noFee')"
          panel-class="fee-select-panel"
          fluid
        >
          <template #value="{ value, placeholder }">
            <span class="fee-selected">
              {{ feeOptions.find((option) => option.value === value)?.label || placeholder }}
            </span>
          </template>
          <template #option="{ option }">
            <div class="fee-option">
              <div class="fee-option-title">
                <span>{{ option.label }}</span>
                <span v-if="option.meta" class="fee-option-meta">{{ option.meta }}</span>
              </div>
              <div v-if="option.detail" class="fee-option-detail">{{ option.detail }}</div>
            </div>
          </template>
        </Select>
        <Button
          v-else
          icon="pi pi-plus"
          :label="t('transactionModal.createFeeProfile')"
          severity="secondary"
          outlined
          fluid
          @click="showFeeModal = true"
        />
      </div>

      <div class="field">
        <label>{{ t('common.notes') }} <span class="text-muted">({{ t('common.optional') }})</span></label>
        <InputText v-model="notes" :placeholder="t('transactionModal.notesPlaceholder')" fluid/>
      </div>

      <div class="total-row">
        <div v-if="type === 'buy'" class="total-line">
          <span class="text-muted">{{ t('common.subtotal') }}</span>
          <span>{{ currencySymbol }}{{ ((shares || 0) * (price || 0)).toFixed(2) }}</span>
        </div>
        <div v-if="type === 'buy' && feeAmount > 0" class="total-line fee-line">
          <span class="text-muted">{{ t('transactionModal.buyFee') }}</span>
          <span class="loss">+{{ useCurrency(feeAmount, feeCurrency) }}</span>
        </div>
        <div v-if="type === 'buy'" class="total-line total-final">
          <span>{{ t('transactionModal.totalCost') }}</span>
          <span class="total-amount">
            {{ currencySymbol }}{{ ((((shares || 0) * (price || 0)) + feeAmount).toFixed(2)) }}
          </span>
        </div>

        <template v-else-if="sellSimulation">
          <div class="total-line">
            <span class="text-muted">{{ t('transactionModal.grossProceeds') }}</span>
            <span>{{ useCurrency(sellSimulation.grossProceeds, currency) }}</span>
          </div>
          <div v-if="sellSimulation.sellFee > 0" class="total-line fee-line">
            <span class="text-muted">{{
                t('transactionModal.sellFee')
              }}{{ sellSimulation.profileName ? ` · ${sellSimulation.profileName}` : '' }}</span>
            <span class="loss">-{{ useCurrency(sellSimulation.sellFee, feeCurrency) }}</span>
          </div>
          <div v-if="sellSimulation.tax > 0" class="total-line fee-line">
            <span class="text-muted">{{
                t('transactionModal.capitalGainsTax')
              }} ({{ formatTaxPercent(sellSimulation.taxRate) }})</span>
            <span class="loss">-{{ useCurrency(sellSimulation.tax, currency) }}</span>
          </div>
          <div v-else-if="sellSimulation.taxRate > 0" class="total-line fee-line">
            <span class="text-muted">{{
                t('transactionModal.capitalGainsTax')
              }} ({{ formatTaxPercent(sellSimulation.taxRate) }})</span>
            <span class="text-muted">{{ t('transactionModal.noTaxableGain') }}</span>
          </div>
          <div class="total-line total-final">
            <span>{{ t('transactionModal.netProceeds') }}</span>
            <span class="total-amount">{{ useCurrency(sellSimulation.netProceeds, currency) }}</span>
          </div>
          <div v-if="sellSimulation.costBasis != null" class="total-line fee-line">
            <span class="text-muted">{{ t('transactionModal.costBasis') }}</span>
            <span>{{ useCurrency(sellSimulation.costBasis, currency) }}</span>
          </div>
          <div v-if="sellSimulation.buyFeesBasis > 0" class="total-line fee-line">
            <span class="text-muted">{{ t('transactionModal.buyFeesBasis') }}</span>
            <span>{{ useCurrency(sellSimulation.buyFeesBasis, currency) }}</span>
          </div>
          <div
              v-if="sellSimulation.netProfit != null"
              :class="sellSimulation.netProfit >= 0 ? 'gain' : 'loss'"
              class="total-line sell-profit"
          >
            <span>{{ t('transactionModal.netProfitLoss') }}</span>
            <span>
              {{ fmt(sellSimulation.netProfit) }}{{ useCurrency(Math.abs(sellSimulation.netProfit), currency) }}
              <template v-if="sellSimulation.netProfitPct != null">
                ({{ fmt(sellSimulation.netProfitPct) }}{{ sellSimulation.netProfitPct.toFixed(2) }}%)
              </template>
            </span>
          </div>
          <div v-else-if="sellSimulation.taxRate > 0" class="total-hint text-muted">
            {{ t('transactionModal.taxFinalizedServer') }}
          </div>
        </template>

        <div v-else class="total-line total-final">
          <span>{{ t('transactionModal.netProceeds') }}</span>
          <span class="total-amount">
            {{ currencySymbol }}{{ ((((shares || 0) * (price || 0)) - feeAmount).toFixed(2)) }}
          </span>
        </div>
      </div>

      <div class="action-row">
        <Button
            :label="type === 'buy' ? t('common.buy') : t('common.sell')"
            :loading="loading"
            :severity="type === 'buy' ? 'success' : 'danger'"
            class="submit-btn"
            @click="submit"
        />
      </div>
    </div>
  </Dialog>

  <FeeProfilesModal v-model:visible="showFeeModal" />
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

.fee-selected {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fee-option {
  max-width: min(340px, calc(100vw - 3rem));
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: normal;
  overflow-wrap: anywhere;
}

.fee-option-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
}

.fee-option-meta {
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
  color: var(--text-secondary);
  font-size: 0.66rem;
  font-weight: 600;
}

.fee-option-detail {
  color: var(--text-secondary);
  font-size: 0.74rem;
  line-height: 1.25;
}

:global(.fee-select-panel) {
  max-width: min(360px, calc(100vw - 2rem));
}

:global(.fee-select-panel .p-select-option) {
  white-space: normal;
}

.total-row { display: flex; flex-direction: column; gap: 4px; padding: 0.75rem; border-radius: 8px; background: rgba(255,255,255,0.04); font-size: 0.9rem; }
.total-line { display: flex; justify-content: space-between; }
.fee-line { font-size: 0.82rem; }
.sell-profit { border-top: 1px solid var(--border); padding-top: 6px; margin-top: 2px; font-weight: 700; }
.sell-profit span:last-child { text-align: right; }
.total-hint { font-size: 0.76rem; text-align: center; }
.info-icon { font-size: 0.72rem; opacity: 0.55; cursor: pointer; }
.info-icon:hover, .info-icon:focus { opacity: 1; color: var(--accent); outline: none; }
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
