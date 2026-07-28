<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useConfirm} from 'primevue/useconfirm'
import {useFeeProfileStore} from '@/stores/feeProfiles'
import {isCrypto, tickerCurrency} from '@/composables/useFormat'
import api from '@/composables/useApi'
import {trackEvent} from '@/composables/useAnalytics'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import {useI18n} from '@/composables/useI18n'

const props = defineProps({
  visible: Boolean,
  transaction: { type: Object, default: null },
})
const emit = defineEmits(['update:visible', 'saved'])

const toast = useToast()
const confirm = useConfirm()
const feeStore = useFeeProfileStore()
const {t} = useI18n()

const shares = ref(null)
const price = ref(null)
const date = ref(new Date())
const notes = ref('')
const selectedFeeProfile = ref(null)
const loading = ref(false)

const ticker = computed(() => props.transaction?.ticker || '')
const crypto = computed(() => isCrypto(ticker.value))
const currency = computed(() => tickerCurrency(ticker.value))
const currencySymbol = computed(() => currency.value === 'ILS' ? '₪' : '$')

function isAllowedFeeCurrency(profileCurrency, transactionCurrency) {
  if (transactionCurrency === 'ILS') return true
  if (profileCurrency === transactionCurrency) return true
  return transactionCurrency === 'USD' && profileCurrency === 'ILS'
}

function feeCurrencyForTransaction(profile) {
  return currency.value === 'ILS' ? 'ILS' : (profile?.currency || currency.value)
}

const matchingProfiles = computed(() => {
  const txCurrency = currency.value
  return feeStore.profiles.filter((p) => {
    if (isAllowedFeeCurrency(p.currency || 'USD', txCurrency)) return true
    return p._id === (props.transaction?.feeProfile?._id || props.transaction?.feeProfile)
  })
})

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
  {label: t('common.noFee'), value: null},
  ...matchingProfiles.value.map((p) => {
    const fee = props.transaction?.type === 'buy' ? p.buyFee : p.sellFee
    const effectiveFeeCurrency = feeCurrencyForTransaction(p)
    const feeStr = fee?.value
      ? (fee.type === 'percent' ? formatFeePercent(fee.value) : `${effectiveFeeCurrency} ${fee.value}`)
      : '0%'
    const taxStr = p.capitalGainsTax ? ` · ${t('transactionModal.capitalGainsTax')} ${formatTaxPercent(p.capitalGainsTax)}` : ''
    return { label: `${p.name} (${feeStr}${taxStr})`, value: p._id }
  }),
])

const total = computed(() => shares.value && price.value ? shares.value * price.value : 0)

onMounted(() => { if (!feeStore.profiles.length) feeStore.fetchProfiles() })

watch(() => props.transaction, (tx) => {
  if (!tx) return
  shares.value = tx.shares
  price.value = tx.price
  date.value = tx.date ? new Date(tx.date) : new Date()
  notes.value = tx.notes || ''
  selectedFeeProfile.value = tx.feeProfile?._id || tx.feeProfile || null
}, { immediate: true })

async function save() {
  if (!shares.value || !price.value) {
    toast.add({severity: 'warn', summary: t('transactionModal.sharesAndPriceRequired'), life: 2000})
    return
  }
  loading.value = true
  try {
    await api.put(`/portfolio/transaction/${props.transaction._id}`, {
      shares: shares.value,
      price: price.value,
      date: date.value,
      notes: notes.value || undefined,
      feeProfileId: selectedFeeProfile.value ?? null,
    })
    toast.add({severity: 'success', summary: t('transactionModal.updated'), life: 2000})
    trackEvent('edit_transaction', {ticker: ticker.value})
    emit('update:visible', false)
    emit('saved')
  } catch (err) {
    toast.add({ severity: 'error', summary: err.message, life: 3000 })
  } finally {
    loading.value = false
  }
}

function confirmDelete() {
  confirm.require({
    message: t('transactionModal.deleteMessage', {
      type: props.transaction?.type,
      shares: props.transaction?.shares,
      ticker: ticker.value
    }),
    header: t('transactionModal.deleteHeader'),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    acceptLabel: t('common.delete'),
    accept: async () => {
      loading.value = true
      try {
        await api.delete(`/portfolio/transaction/${props.transaction._id}`)
        toast.add({severity: 'success', summary: t('transactionModal.deleted'), life: 2000})
        emit('update:visible', false)
        emit('saved')
      } catch (err) {
        toast.add({severity: 'error', summary: err.message, life: 3000})
      } finally {
        loading.value = false
      }
    },
  })
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    modal
    :style="{ width: '95vw', maxWidth: '420px' }"
    :draggable="false"
  >
    <template #header>
      <div class="modal-header">
        <Tag
          :value="transaction?.type?.toUpperCase()"
          :severity="transaction?.type === 'buy' ? 'success' : transaction?.type === 'sell' ? 'danger' : 'info'"
        />
        <span class="modal-title">{{ t('transactionModal.editTitle', {ticker}) }}</span>
      </div>
    </template>

    <div class="edit-form">
      <div class="fields-row">
        <div class="field">
          <label>{{
              transaction?.type === 'dividend' ? (transaction?.drip ? t('transactionModal.dripShares') : t('transactionModal.sharesHeld')) : (crypto ? t('common.amount') : t('common.shares'))
            }}</label>
          <InputNumber v-model="shares" :max-fraction-digits="crypto ? 8 : 4" :min="0" fluid/>
        </div>
        <div class="field">
          <label>{{
              transaction?.type === 'dividend' ? t('transactionModal.dividendPerShare') : (crypto ? t('transactionModal.pricePerCoin') : t('transactionModal.pricePerShare'))
            }}</label>
          <InputNumber
            v-model="price"
            mode="currency"
            :currency="currency"
            :max-fraction-digits="crypto ? 8 : 4"
            :min="0"
            fluid
          />
        </div>
      </div>

      <div class="field">
        <label>{{ t('common.date') }}</label>
        <DatePicker v-model="date" :max-date="new Date()" date-format="dd/mm/yy" show-icon fluid />
      </div>

      <div class="field">
        <label>{{ t('transactionModal.brokerageFee') }}</label>
        <Select v-model="selectedFeeProfile" :options="feeOptions" option-label="label" option-value="value" fluid />
      </div>

      <div class="field">
        <label>{{ t('common.notes') }} <span class="text-muted">({{ t('common.optional') }})</span></label>
        <InputText v-model="notes" fluid />
      </div>

      <div class="total-row" v-if="total > 0">
        <span class="text-muted">{{ t('common.total') }}</span>
        <span class="total-amount">{{ currencySymbol }}{{ total.toFixed(2) }}</span>
      </div>

      <div class="actions">
        <Button :disabled="loading" :label="t('common.delete')" icon="pi pi-trash" severity="danger"
                @click="confirmDelete"/>
        <Button :label="t('transactionModal.saveChanges')" :loading="loading" class="save-btn" outlined @click="save"/>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.modal-header { display: flex; align-items: center; gap: 0.75rem; }
.modal-title { font-weight: 600; font-size: 1rem; }
.edit-form { display: flex; flex-direction: column; gap: 1rem; }
.fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label { font-size: 0.82rem; color: var(--text-secondary); }
.total-row { display: flex; justify-content: space-between; padding: 0.5rem 0.75rem; border-radius: 8px; background: rgba(255,255,255,0.04); }
.total-amount { font-weight: 600; }

.actions {
  display: flex;
  gap: 0.5rem;
}

.save-btn {
  flex: 1;
}
</style>
