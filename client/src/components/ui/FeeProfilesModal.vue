<script setup>
import {computed, onMounted, ref} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useFeeProfileStore} from '@/stores/feeProfiles'
import {useCurrency} from '@/composables/useFormat'
import {trackEvent} from '@/composables/useAnalytics'
import {useI18n} from '@/composables/useI18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['update:visible'])

const toast = useToast()
const store = useFeeProfileStore()
const {t} = useI18n()

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

const editing = ref(null)
const form = ref(defaultForm())
const visibleProfiles = computed(() => [
  ...BUILTIN_FEE_PROFILES,
  ...store.profiles,
])
const feeTypeOptions = computed(() => [
  {label: t('feeProfiles.percent'), value: 'percent'},
  {label: t('feeProfiles.flat'), value: 'flat'},
])
const currencyOptions = computed(() => [
  {label: '₪ ILS', value: 'ILS'},
  {label: '$ USD', value: 'USD'},
])

function defaultForm() {
  return {
    name: '',
    currency: 'ILS',
    tradingFee: { type: 'percent', value: 0.1, minFee: 10 },
    capitalGainsTax: 25,
    isDefault: false,
  }
}

onMounted(() => { if (!store.profiles.length) store.fetchProfiles() })

function openNew() { editing.value = 'new'; form.value = defaultForm() }

function percentToDisplay(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num * 100 : 0
}

function percentToStored(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num / 100 : 0
}

function feeRuleToForm(rule) {
  const next = { type: rule?.type || 'percent', value: Number(rule?.value) || 0, minFee: Number(rule?.minFee) || 0 }
  if (next.type === 'percent') next.value = percentToDisplay(next.value)
  return next
}

function feeRuleToPayload(rule) {
  const next = { type: rule?.type || 'percent', value: Number(rule?.value) || 0, minFee: Number(rule?.minFee) || 0 }
  if (next.type === 'percent') next.value = percentToStored(next.value)
  return next
}

function formPayload() {
  const tradingFee = feeRuleToPayload(form.value.tradingFee)
  return {
    name: form.value.name,
    currency: form.value.currency || 'ILS',
    buyFee: { ...tradingFee },
    sellFee: { ...tradingFee },
    capitalGainsTax: form.value.capitalGainsTax,
    isDefault: form.value.isDefault,
  }
}

function openEdit(p) {
  if (p.builtin) return
  editing.value = p
  form.value = {
    name: p.name,
    currency: p.currency || 'USD',
    tradingFee: feeRuleToForm(p.buyFee || p.sellFee),
    capitalGainsTax: p.capitalGainsTax || 0,
    isDefault: p.isDefault,
  }
}
function closeEdit() { editing.value = null }

function formatPercentValue(value, digits = 3) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0'
  return trimTrailingZeros(num.toFixed(digits))
}

function trimTrailingZeros(text) {
  return text.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '').replace(/\.$/u, '')
}

function formatFeePercent(value, digits = 3) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0%'
  return `${trimTrailingZeros((num * 100).toFixed(digits))}%`
}

async function save() {
  if (!form.value.name) {
    toast.add({severity: 'warn', summary: t('feeProfiles.nameRequired'), life: 2000});
    return
  }
  try {
    const payload = formPayload()
    if (editing.value === 'new') {
      await store.createProfile(payload)
      toast.add({severity: 'success', summary: t('feeProfiles.created'), life: 2000})
      trackEvent('create_fee_profile', {})
    } else {
      await store.updateProfile(editing.value._id, payload)
      toast.add({severity: 'success', summary: t('feeProfiles.updated'), life: 2000})
      trackEvent('update_fee_profile', {})
    }
    closeEdit()
  } catch (err) {
    toast.add({ severity: 'error', summary: err.message, life: 3000 })
  }
}

async function remove(p) {
  if (p.builtin) return
  try {
    await store.deleteProfile(p._id)
    toast.add({severity: 'success', summary: t('feeProfiles.deleted'), life: 2000})
  } catch (err) {
    toast.add({ severity: 'error', summary: err.message, life: 3000 })
  }
}

function feeLabel(p) {
  if (sameFeeRule(p.buyFee, p.sellFee) && hasFeeRule(p.buyFee)) {
    const currency = p.currency || 'USD'
    const fee = `${t('feeProfiles.tradingFee')} ${formatFeeRule(p.buyFee, currency)}`
    const currencyLabel = `${t('feeProfiles.currency')} ${currency}`
    const usage = p.monthlyUsage ? formatMonthlyUsage(p.monthlyUsage) : null
    const tax = p.capitalGainsTax ? `${t('feeProfiles.tax')} ${formatPercentValue(p.capitalGainsTax)}%` : null
    return [currencyLabel, fee, usage, tax].filter(Boolean).join(' · ')
  }

  const currencyLabel = `${t('feeProfiles.currency')} ${p.currency || 'USD'}`
  const buy = hasFeeRule(p.buyFee)
      ? `${t('feeProfiles.buy')} ${formatFeeRule(p.buyFee, p.currency || 'USD')}`
    : null
  const sell = hasFeeRule(p.sellFee)
      ? `${t('feeProfiles.sell')} ${formatFeeRule(p.sellFee, p.currency || 'USD')}`
    : null
  const usage = p.monthlyUsage ? formatMonthlyUsage(p.monthlyUsage) : null
  const tax = p.capitalGainsTax ? `${t('feeProfiles.tax')} ${formatPercentValue(p.capitalGainsTax)}%` : null
  return [currencyLabel, buy, sell, usage, tax].filter(Boolean).join(' · ') || t('feeProfiles.noFees')
}

function sameFeeRule(a, b) {
  if (!a || !b) return false
  return (a.type || 'percent') === (b.type || 'percent')
      && (Number(a.value) || 0) === (Number(b.value) || 0)
      && (Number(a.minFee) || 0) === (Number(b.minFee) || 0)
}

function hasFeeRule(rule) {
  return Boolean(rule && ((Number(rule.value) || 0) > 0 || (Number(rule.minFee) || 0) > 0))
}

function formatFeeRule(rule, currency = 'USD') {
  if (!rule) return '0'
  const value = Number(rule.value) || 0
  const minFee = Number(rule.minFee) || 0
  let fee = '0'
  if (rule.type === 'percent') fee = formatFeePercent(value)
  else if (rule.type === 'perShare') fee = `${useCurrency(value, currency)} / ${t('feeProfiles.share')}`
  else fee = useCurrency(value, currency)
  return minFee ? `${fee} ${t('feeProfiles.min')} ${useCurrency(minFee, currency)}` : fee
}

function formatMonthlyUsage(usage) {
  const parts = []
  if (usage.transactions) parts.push(t('feeProfiles.txPerMonth', {count: usage.transactions}))
  if (usage.shares) parts.push(t('feeProfiles.sharesPerMonth', {count: usage.shares.toLocaleString()}))
  return parts.join(` ${t('feeProfiles.or')} `)
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    modal
    :header="t('feeProfiles.title')"
    :style="{ width: '95vw', maxWidth: '460px' }"
    :draggable="false"
  >
    <!-- Profile list -->
    <div v-if="!editing">
      <div v-if="store.loading" class="text-muted">{{ t('common.loading') }}</div>
      <div v-else-if="!visibleProfiles.length" class="empty">
        <p class="text-muted">{{ t('feeProfiles.empty') }}</p>
      </div>
      <div v-else class="profile-list">
        <div v-for="p in visibleProfiles" :key="p._id" class="profile-row" :class="{ preset: p.builtin }">
          <div class="profile-info" @click="openEdit(p)">
            <span class="profile-name">
              {{ p.name }}
              <span v-if="p.builtin" class="preset-badge">{{ t('feeProfiles.preset') }}</span>
              <span v-if="p.isDefault" class="default-badge">{{ t('feeProfiles.default') }}</span>
            </span>
            <span class="profile-detail text-muted">{{ feeLabel(p) }}</span>
          </div>
          <div v-if="!p.builtin" class="profile-actions">
            <Button icon="pi pi-pencil" text rounded size="small" @click="openEdit(p)" />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger" @click="remove(p)" />
          </div>
        </div>
      </div>
      <Button :label="t('feeProfiles.addProfile')" class="mt" fluid icon="pi pi-plus" @click="openNew"/>
    </div>

    <!-- Edit / Create form -->
    <div v-else class="fee-form">
      <div class="form-header">
        <Button icon="pi pi-arrow-left" text rounded size="small" @click="closeEdit" />
        <span class="form-title">{{
            editing === 'new' ? t('feeProfiles.newProfile') : t('feeProfiles.editProfile')
          }}</span>
      </div>

      <div class="field">
        <label>{{ t('feeProfiles.brokerName') }}</label>
        <InputText v-model="form.name" :placeholder="t('feeProfiles.brokerPlaceholder')" fluid/>
      </div>

      <div class="field">
        <label>{{ t('feeProfiles.currency') }} <span class="text-muted">{{ t('feeProfiles.currencyHint') }}</span></label>
        <SelectButton v-model="form.currency" :allow-empty="false" :options="currencyOptions" option-label="label"
                      option-value="value"/>
      </div>

      <!-- Trading fee -->
      <div class="fee-section">
        <p class="fee-section-title">{{ t('feeProfiles.tradingFee') }} <i
            v-tooltip.focus.top="t('feeProfiles.infoTradingFee')" class="pi pi-info-circle info-icon" tabindex="0"/>
        </p>
        <div class="fields-row">
          <div class="field">
            <label>{{ t('feeProfiles.type') }}</label>
            <SelectButton v-model="form.tradingFee.type" :options="feeTypeOptions" option-label="label"
                          option-value="value"/>
          </div>
          <div class="field">
            <label>{{
                form.tradingFee.type === 'percent' ? t('feeProfiles.feePercent') : t('feeProfiles.flatAmount')
              }}</label>
            <InputNumber v-model="form.tradingFee.value" :min="0" :max-fraction-digits="form.tradingFee.type === 'percent' ? 3 : 4"
              :suffix="form.tradingFee.type === 'percent' ? '%' : ''" placeholder="0" fluid />
            <small v-if="form.tradingFee.type === 'percent'" class="field-hint text-muted">{{
                t('feeProfiles.percentHint')
              }}</small>
          </div>
        </div>
        <div class="field">
          <label>{{ t('feeProfiles.minTradingFee') }} <i v-tooltip.focus.top="t('feeProfiles.infoMinTradingFee')" class="pi pi-info-circle info-icon"
                                                      tabindex="0"/></label>
          <InputNumber v-model="form.tradingFee.minFee" :min="0" :max-fraction-digits="2" placeholder="0" fluid />
        </div>
      </div>

      <!-- Capital gains tax -->
      <div class="fee-section">
        <p class="fee-section-title">{{ t('feeProfiles.capitalGainsTax') }} <i
            v-tooltip.focus.top="t('feeProfiles.infoCapitalGainsTax')" class="pi pi-info-circle info-icon"
            tabindex="0"/></p>
        <div class="field">
          <label>{{ t('feeProfiles.taxRate') }} <span class="text-muted">{{
              t('feeProfiles.taxRateHint')
            }}</span></label>
          <InputNumber v-model="form.capitalGainsTax" :min="0" :max="100" :max-fraction-digits="3"
                       :placeholder="t('feeProfiles.taxPlaceholder')" fluid suffix="%"/>
        </div>
      </div>

      <div class="field-row-inline">
        <label>{{ t('feeProfiles.setDefault') }}</label>
        <ToggleSwitch v-model="form.isDefault" />
      </div>

      <Button :label="t('common.save')" fluid @click="save"/>
    </div>
  </Dialog>
</template>

<style scoped>
.profile-list { display: flex; flex-direction: column; margin-bottom: 0.75rem; }
.profile-row { display: flex; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
.profile-row.preset .profile-info { cursor: default; }
.profile-info { flex: 1; display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
.profile-actions { display: flex; align-items: center; gap: 0.2rem; margin-left: 0.5rem; }
.profile-name { font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; }
.default-badge { font-size: 0.68rem; background: var(--accent); color: #fff; border-radius: 4px; padding: 1px 6px; }
.preset-badge { font-size: 0.68rem; background: rgba(255,255,255,0.08); color: var(--text-secondary); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; }
.profile-detail { font-size: 0.78rem; }
.profile-country { font-size: 0.75rem; }
.empty { display: block; height: auto; padding: 0.5rem 0 1rem; }
.mt { margin-top: 0.5rem; }

.fee-form { display: flex; flex-direction: column; gap: 0.7rem; }
.form-header { display: flex; align-items: center; gap: 0.5rem; }
.form-title { font-weight: 600; font-size: 1rem; color: var(--text-primary); }
.fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.55rem; }
.field { display: flex; flex-direction: column; gap: 0.3rem; }
.field label { font-size: 0.82rem; color: var(--text-secondary); }
.field-hint { font-size: 0.72rem; }
.info-icon { font-size: 0.72rem; opacity: 0.55; cursor: pointer; }
.info-icon:hover, .info-icon:focus { opacity: 1; color: var(--accent); outline: none; }
.fee-section { background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 0.55rem; display: flex; flex-direction: column; gap: 0.55rem; }
.fee-section-title { font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
.field-row-inline { display: flex; justify-content: space-between; align-items: center; }
.field-row-inline label { font-size: 0.85rem; color: var(--text-secondary); }
</style>
