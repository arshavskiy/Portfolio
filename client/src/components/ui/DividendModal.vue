<script setup>
import {computed, ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {usePortfolioStore} from '@/stores/portfolio'
import {tickerCurrency, useCurrency} from '@/composables/useFormat'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import api from '@/composables/useApi'

const props = defineProps({
  visible: Boolean,
  defaultTicker: {type: String, default: ''},
  positionShares: {type: Number, default: null}, // shares held, for per-share calc
  currentPrice: {type: Number, default: null},
})
const emit = defineEmits(['update:visible', 'saved'])

const toast = useToast()
const portfolio = usePortfolioStore()

const ticker = ref('')
const amountPerShare = ref(null)
const dripShares = ref(null)
const date = ref(new Date())
const notes = ref('')
const drip = ref(false)
const loading = ref(false)

const currency = computed(() => tickerCurrency(ticker.value))
const currencySymbol = computed(() => currency.value === 'ILS' ? '₪' : '$')

// Total cash received = amountPerShare * shares held
const totalCash = computed(() => {
  if (!amountPerShare.value || !props.positionShares) return null
  return amountPerShare.value * props.positionShares
})

// Annualised yield estimate (div per share / current price * 4 quarters)
const yieldEstimate = computed(() => {
  if (!amountPerShare.value || !props.currentPrice || props.currentPrice <= 0) return null
  return (amountPerShare.value / props.currentPrice) * 4 * 100
})

watch(() => props.visible, (v) => {
  if (v) {
    ticker.value = props.defaultTicker || ''
    amountPerShare.value = null
    dripShares.value = null
    date.value = new Date()
    notes.value = ''
    drip.value = false
  }
})

watch(drip, (on) => {
  if (!on) dripShares.value = null
})

async function submit() {
  if (!ticker.value || !amountPerShare.value) {
    toast.add({severity: 'warn', summary: 'Ticker and amount per share required', life: 2000})
    return
  }
  const shares = drip.value ? (dripShares.value || 0) : (props.positionShares || 0)
  const total = amountPerShare.value * (props.positionShares || shares || 1)
  loading.value = true
  try {
    await api.post('/portfolio/transaction', {
      ticker: ticker.value.toUpperCase(),
      type: 'dividend',
      shares: drip.value ? (dripShares.value || 0) : 0,
      price: amountPerShare.value,
      total,
      date: date.value,
      notes: notes.value || undefined,
      drip: drip.value,
    })
    await portfolio.fetchPortfolio()
    toast.add({severity: 'success', summary: `Dividend logged for ${ticker.value.toUpperCase()}`, life: 2000})
    emit('update:visible', false)
    emit('saved')
  } catch (err) {
    toast.add({severity: 'error', summary: 'Error', detail: err.message, life: 3000})
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog
      :draggable="false"
      :style="{ width: '95vw', maxWidth: '420px' }"
      :visible="visible"
      header="Log Dividend"
      modal
      @update:visible="emit('update:visible', $event)"
  >
    <div class="div-form">
      <div class="field">
        <label>Ticker</label>
        <InputText v-model="ticker" :placeholder="defaultTicker || 'AAPL'" fluid style="text-transform:uppercase"/>
      </div>

      <div class="field">
        <label>Dividend per share</label>
        <InputNumber v-model="amountPerShare" :currency="currency" :max-fraction-digits="4" :min="0" fluid
                     mode="currency"/>
        <span v-if="yieldEstimate != null" class="hint text-muted">
          ≈ {{ yieldEstimate.toFixed(2) }}% annualised yield (×4)
        </span>
      </div>

      <div v-if="totalCash != null" class="total-preview">
        <span class="text-muted">Total received</span>
        <span class="total-val">{{ useCurrency(totalCash, currency) }}</span>
      </div>

      <div class="drip-row">
        <div class="drip-label">
          <span>DRIP (reinvested as shares)</span>
          <span class="text-muted hint">Dividend used to buy additional shares</span>
        </div>
        <ToggleSwitch v-model="drip"/>
      </div>

      <div v-if="drip" class="field">
        <label>Shares received (DRIP)</label>
        <InputNumber v-model="dripShares" :max-fraction-digits="4" :min="0" fluid placeholder="0"/>
        <span v-if="dripShares && amountPerShare" class="hint text-muted">
          At {{ currencySymbol }}{{ amountPerShare.toFixed(4) }} / share
        </span>
      </div>

      <div class="field">
        <label>Date</label>
        <DatePicker v-model="date" :max-date="new Date()" date-format="dd/mm/yy" fluid show-icon/>
      </div>

      <div class="field">
        <label>Notes <span class="text-muted">(optional)</span></label>
        <InputText v-model="notes" fluid placeholder="Q2 2025 dividend"/>
      </div>

      <Button :loading="loading" label="Log Dividend" outlined severity="success" @click="submit"/>
    </div>
  </Dialog>
</template>

<style scoped>
.div-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field label {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.hint {
  font-size: 0.72rem;
}

.total-preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0.85rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  font-size: 0.9rem;
}

.total-val {
  font-weight: 700;
  color: var(--neon-green);
}

.drip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 0.85rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.drip-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.drip-label span:first-child {
  font-size: 0.88rem;
  font-weight: 500;
}
</style>
