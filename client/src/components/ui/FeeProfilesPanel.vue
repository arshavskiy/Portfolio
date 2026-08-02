<script setup>
import {computed, nextTick, onMounted, ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useFeeProfileStore} from '@/stores/feeProfiles'
import {useCurrency} from '@/composables/useFormat'
import {trackEvent} from '@/composables/useAnalytics'
import {useI18n} from '@/composables/useI18n'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'

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
const scheduleHydrating = ref(false)
const visibleProfiles = computed(() => [
  ...BUILTIN_FEE_PROFILES,
  ...store.profiles,
])
const visibleProfileRows = computed(() =>
  visibleProfiles.value.flatMap((profile) =>
    profileCurrencies(profile).map((currency) => ({
      key: `${profile._id}:${currency}`,
      profile,
      currency,
    }))
  )
)
const feeTypeOptions = computed(() => [
  {label: t('feeProfiles.percent'), value: 'percent'},
  {label: t('feeProfiles.flat'), value: 'flat'},
])
const currencyOptions = computed(() => [
  {label: '₪ ILS', value: 'ILS'},
  {label: '$ USD', value: 'USD'},
])

function defaultStoredTradingFee(currency = 'ILS') {
  return {
    type: 'percent',
    value: 0.00001,
    minFee: 10,
  }
}

function defaultStoredSchedule(currency = 'ILS') {
  return {
    buyFee: defaultStoredTradingFee(currency),
    sellFee: defaultStoredTradingFee(currency),
    capitalGainsTax: 25,
  }
}

function cloneSchedule(schedule, currency = 'ILS') {
  const fallback = defaultStoredSchedule(currency)
  const sharedFee = schedule?.tradingFee || schedule?.buyFee || schedule?.sellFee || fallback.buyFee
  return {
    buyFee: feeRuleToForm(schedule?.buyFee || sharedFee, currency),
    sellFee: feeRuleToForm(schedule?.sellFee || sharedFee, currency),
    capitalGainsTax: Number(schedule?.capitalGainsTax) || fallback.capitalGainsTax,
  }
}

function defaultScheduleMap() {
  return {
    ILS: cloneSchedule(defaultStoredSchedule('ILS'), 'ILS'),
    USD: cloneSchedule(defaultStoredSchedule('USD'), 'USD'),
  }
}

function defaultForm() {
  const schedules = defaultScheduleMap()
  return {
    name: '',
    currency: 'ILS',
    tradingFee: { ...schedules.ILS.buyFee },
    capitalGainsTax: schedules.ILS.capitalGainsTax,
    feeSchedules: schedules,
    isDefault: false,
  }
}

onMounted(() => { if (!store.profiles.length) store.fetchProfiles() })

function openNew() {
  editing.value = 'new'
  scheduleHydrating.value = true
  form.value = defaultForm()
  nextTick(() => { scheduleHydrating.value = false })
}

function percentToDisplay(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num * 100 : 0
}

function percentToStored(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num / 100 : 0
}

function feeRuleToForm(rule, currency = 'ILS') {
  const fallback = defaultStoredTradingFee(currency)
  const next = { type: rule?.type || 'percent', value: Number(rule?.value) || 0, minFee: Number(rule?.minFee) || 0 }
  if (next.type === 'percent') {
    const displayValue = percentToDisplay(next.value)
    next.value = displayValue > 100 ? percentToDisplay(fallback.value) : displayValue
  }
  return next
}

function feeRuleToPayload(rule) {
  const next = { type: rule?.type || 'percent', value: Number(rule?.value) || 0, minFee: Number(rule?.minFee) || 0 }
  if (next.type === 'percent') next.value = percentToStored(next.value)
  return next
}

function cloneFormFeeRule(rule) {
  return {
    type: rule?.type || 'percent',
    value: Number(rule?.value) || 0,
    minFee: Number(rule?.minFee) || 0,
  }
}

function cloneFormSchedule(schedule, currency = 'ILS') {
  const fallback = cloneSchedule(defaultStoredSchedule(currency), currency)
  const sharedFee = schedule?.tradingFee || schedule?.buyFee || schedule?.sellFee || fallback.buyFee
  return {
    buyFee: cloneFormFeeRule(schedule?.buyFee || sharedFee),
    sellFee: cloneFormFeeRule(schedule?.sellFee || sharedFee),
    capitalGainsTax: Number(schedule?.capitalGainsTax) || fallback.capitalGainsTax,
  }
}

function normalizeSchedulePayload(schedule) {
  const currency = schedule?.currency || 'ILS'
  const fallback = defaultStoredSchedule(currency)
  const sharedFee = schedule?.tradingFee || schedule?.buyFee || schedule?.sellFee || fallback.buyFee
  return {
    buyFee: feeRuleToPayload(schedule?.buyFee || sharedFee),
    sellFee: feeRuleToPayload(schedule?.sellFee || sharedFee),
    capitalGainsTax: Number(schedule?.capitalGainsTax) || fallback.capitalGainsTax,
  }
}

function profileCurrencies(p) {
  const currencies = ['ILS', 'USD'].filter((currency) => p?.feesByCurrency?.[currency])
  if (!currencies.length) currencies.push(p?.currency || 'USD')
  return currencies
}

function formPayload() {
  const activeCurrency = form.value.currency || 'ILS'
  const activeSchedule = normalizeSchedulePayload({
    currency: activeCurrency,
    buyFee: form.value.tradingFee,
    sellFee: form.value.tradingFee,
    capitalGainsTax: form.value.capitalGainsTax,
  })
  const schedules = {
    ILS: normalizeSchedulePayload({
      currency: 'ILS',
      ...(form.value.feeSchedules?.ILS || cloneSchedule(defaultStoredSchedule('ILS'), 'ILS')),
    }),
    USD: normalizeSchedulePayload({
      currency: 'USD',
      ...(form.value.feeSchedules?.USD || cloneSchedule(defaultStoredSchedule('USD'), 'USD')),
    }),
  }
  schedules[activeCurrency] = activeSchedule
  return {
    name: form.value.name,
    currency: activeCurrency,
    buyFee: { ...activeSchedule.buyFee },
    sellFee: { ...activeSchedule.sellFee },
    capitalGainsTax: activeSchedule.capitalGainsTax,
    feesByCurrency: schedules,
    isDefault: form.value.isDefault,
  }
}

function openEdit(p, currency = null) {
  if (p.builtin) return
  const primaryCurrency = currency || p.currency || (p.feesByCurrency?.USD ? 'USD' : 'ILS')
  const secondaryCurrency = primaryCurrency === 'ILS' ? 'USD' : 'ILS'
  const primarySchedule = cloneSchedule(p.feesByCurrency?.[primaryCurrency] || {
    buyFee: p.buyFee,
    sellFee: p.sellFee,
    capitalGainsTax: p.capitalGainsTax,
  }, primaryCurrency)
  const secondarySchedule = cloneSchedule(
    p.feesByCurrency?.[secondaryCurrency] || defaultStoredSchedule(secondaryCurrency),
    secondaryCurrency
  )
  scheduleHydrating.value = true
  editing.value = p
  form.value = {
    name: p.name,
    currency: primaryCurrency,
    tradingFee: { ...primarySchedule.buyFee },
    capitalGainsTax: primarySchedule.capitalGainsTax,
    feeSchedules: {
      [primaryCurrency]: primarySchedule,
    [secondaryCurrency]: secondarySchedule,
    },
    isDefault: p.isDefault,
  }
  nextTick(() => { scheduleHydrating.value = false })
}
function closeEdit() { editing.value = null }

watch(
  () => form.value.currency,
  (next, prev) => {
    if (scheduleHydrating.value || !next || !form.value.feeSchedules) return
    if (prev) {
      form.value.feeSchedules[prev] = {
        buyFee: { ...form.value.tradingFee },
        sellFee: { ...form.value.tradingFee },
        capitalGainsTax: form.value.capitalGainsTax,
      }
    }
    const nextSchedule = cloneFormSchedule(
      form.value.feeSchedules[next] || defaultScheduleMap()[next],
      next
    )
    form.value.feeSchedules[next] = nextSchedule
    form.value.tradingFee = cloneFormFeeRule(nextSchedule.buyFee || nextSchedule.sellFee || nextSchedule.tradingFee)
    form.value.capitalGainsTax = nextSchedule.capitalGainsTax || 0
  }
)

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

function feeLabel(p, currency = null) {
  const activeCurrency = currency || profileCurrencies(p)[0] || p.currency || 'USD'
  const schedule = p.feesByCurrency?.[activeCurrency] || {
    buyFee: p.buyFee,
    sellFee: p.sellFee,
    capitalGainsTax: p.capitalGainsTax,
  }
  const currencyLabel = `${t('feeProfiles.currency')} ${activeCurrency}`
  const feeRule = schedule.buyFee || schedule.sellFee || schedule.tradingFee
  const fee = hasFeeRule(feeRule)
    ? `${t('feeProfiles.tradingFee')} ${formatFeeRule(feeRule, activeCurrency)}`
    : null
  const usage = p.monthlyUsage ? formatMonthlyUsage(p.monthlyUsage) : null
  const tax = schedule.capitalGainsTax ? `${t('feeProfiles.tax')} ${formatPercentValue(schedule.capitalGainsTax)}%` : null
  return [currencyLabel, fee, usage, tax].filter(Boolean).join(' · ') || t('feeProfiles.noFees')
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
  <div class="fee-profiles-panel">
    <!-- Profile list -->
    <div v-if="!editing">
      <div v-if="store.loading" class="text-muted">{{ t('common.loading') }}</div>
      <div v-else-if="!visibleProfileRows.length" class="empty">
        <p class="text-muted">{{ t('feeProfiles.empty') }}</p>
      </div>
      <div v-else class="profile-list">
        <div
          v-for="row in visibleProfileRows"
          :key="row.key"
          class="profile-row"
          :class="{ preset: row.profile.builtin }"
        >
          <div class="profile-info" @click="openEdit(row.profile, row.currency)">
            <span class="profile-name">
              {{ row.profile.name }}
              <span class="currency-badge">{{ row.currency }}</span>
              <span v-if="row.profile.builtin" class="preset-badge">{{ t('feeProfiles.preset') }}</span>
              <span v-if="row.profile.isDefault" class="default-badge">{{ t('feeProfiles.default') }}</span>
            </span>
            <span class="profile-detail text-muted">{{ feeLabel(row.profile, row.currency) }}</span>
          </div>
          <div v-if="!row.profile.builtin" class="profile-actions">
            <Button icon="pi pi-pencil" text rounded size="small" @click="openEdit(row.profile, row.currency)" />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger" @click="remove(row.profile)" />
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
  </div>
</template>

<style scoped>
.profile-list { display: flex; flex-direction: column; margin-bottom: 0.75rem; }
.profile-row { display: flex; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
.profile-row.preset .profile-info { cursor: default; }
.profile-info { flex: 1; display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
.profile-actions { display: flex; align-items: center; gap: 0.2rem; margin-left: 0.5rem; }
.profile-name { font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; }
.currency-badge { font-size: 0.68rem; color: var(--text-secondary); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; }
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
