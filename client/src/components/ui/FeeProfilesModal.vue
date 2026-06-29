<script setup>
import {computed, onMounted, ref} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useFeeProfileStore} from '@/stores/feeProfiles'
import {useCurrency} from '@/composables/useFormat'
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

// ⓘ tooltip explanations, see project_info_tooltip_pattern
const INFO = {
  buyFee: 'Commission your broker charges when you buy. Percent of trade value, or a flat amount per order.',
  sellFee: 'Commission your broker charges when you sell. Percent of trade value, or a flat amount per order.',
  minBuyFee: 'Minimum buy commission charged even when the percentage fee would be lower.',
  minSellFee: 'Minimum sell commission charged even when the percentage fee would be lower.',
  capitalGainsTax: 'Tax rate applied to your profit when you sell at a gain. E.g. 25% in Israel.',
}

const editing = ref(null)
const form = ref(defaultForm())
const visibleProfiles = computed(() => [
  ...BUILTIN_FEE_PROFILES,
  ...store.profiles,
])

function defaultForm() {
  return {
    name: '',
    buyFee: { type: 'percent', value: 0, minFee: 0 },
    sellFee: { type: 'percent', value: 0, minFee: 0 },
    capitalGainsTax: 0,
    isDefault: false,
  }
}

onMounted(() => { if (!store.profiles.length) store.fetchProfiles() })

function openNew() { editing.value = 'new'; form.value = defaultForm() }
function openEdit(p) {
  if (p.builtin) return
  editing.value = p
  form.value = {
    name: p.name,
    buyFee: { ...p.buyFee },
    sellFee: { ...p.sellFee },
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
    toast.add({ severity: 'warn', summary: 'Name required', life: 2000 }); return
  }
  try {
    if (editing.value === 'new') {
      await store.createProfile(form.value)
      toast.add({ severity: 'success', summary: 'Fee profile created', life: 2000 })
    } else {
      await store.updateProfile(editing.value._id, form.value)
      toast.add({ severity: 'success', summary: 'Updated', life: 2000 })
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
    toast.add({ severity: 'success', summary: 'Deleted', life: 2000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: err.message, life: 3000 })
  }
}

function feeLabel(p) {
  const buy = p.buyFee?.value
    ? `Buy ${formatFeeRule(p.buyFee, p.currency || 'USD')}`
    : null
  const sell = p.sellFee?.value
    ? `Sell ${formatFeeRule(p.sellFee, p.currency || 'USD')}`
    : null
  const usage = p.monthlyUsage ? formatMonthlyUsage(p.monthlyUsage) : null
  const tax = p.capitalGainsTax ? `Tax ${formatPercentValue(p.capitalGainsTax)}%` : null
  return [buy, sell, usage, tax].filter(Boolean).join(' · ') || 'No fees'
}

function formatFeeRule(rule, currency = 'USD') {
  if (!rule?.value) return '0'
  if (rule.type === 'percent') return formatFeePercent(rule.value)
  if (rule.type === 'perShare') return `${useCurrency(rule.value, currency)} / share`
  return useCurrency(rule.value, currency)
}

function formatMonthlyUsage(usage) {
  const parts = []
  if (usage.transactions) parts.push(`${usage.transactions} tx/mo`)
  if (usage.shares) parts.push(`${usage.shares.toLocaleString()} shares/mo`)
  return parts.join(' or ')
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    modal
    header="Fee Profiles"
    :style="{ width: '95vw', maxWidth: '460px' }"
    :draggable="false"
  >
    <!-- Profile list -->
    <div v-if="!editing">
      <div v-if="store.loading" class="text-muted">Loading...</div>
      <div v-else-if="!visibleProfiles.length" class="empty">
        <p class="text-muted">No fee profiles yet. Add one to track brokerage costs.</p>
      </div>
      <div v-else class="profile-list">
        <div v-for="p in visibleProfiles" :key="p._id" class="profile-row" :class="{ preset: p.builtin }">
          <div class="profile-info" @click="openEdit(p)">
            <span class="profile-name">
              {{ p.name }}
              <span v-if="p.builtin" class="preset-badge">Preset</span>
              <span v-if="p.isDefault" class="default-badge">Default</span>
            </span>
            <span class="profile-detail text-muted">{{ feeLabel(p) }}</span>
          </div>
          <div v-if="!p.builtin" class="profile-actions">
            <Button icon="pi pi-pencil" text rounded size="small" @click="openEdit(p)" />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger" @click="remove(p)" />
          </div>
        </div>
      </div>
      <Button class="mt" fluid icon="pi pi-plus" label="Add Profile" @click="openNew"/>
    </div>

    <!-- Edit / Create form -->
    <div v-else class="fee-form">
      <div class="form-header">
        <Button icon="pi pi-arrow-left" text rounded size="small" @click="closeEdit" />
        <span class="form-title">{{ editing === 'new' ? 'New Profile' : 'Edit Profile' }}</span>
      </div>

      <div class="field">
        <label>Broker / Vendor name</label>
        <InputText v-model="form.name" placeholder="e.g. IBI, Meitav, IBKR" fluid />
      </div>

      <!-- Buy fee -->
      <div class="fee-section">
        <p class="fee-section-title">Buy Fee <i v-tooltip.focus.top="INFO.buyFee" tabindex="0" class="pi pi-info-circle info-icon"/></p>
        <div class="fields-row">
          <div class="field">
            <label>Type</label>
            <SelectButton v-model="form.buyFee.type" :options="['percent', 'flat']" />
          </div>
          <div class="field">
            <label>{{ form.buyFee.type === 'percent' ? 'Fee %' : 'Flat amount' }}</label>
            <InputNumber v-model="form.buyFee.value" :min="0" :max-fraction-digits="form.buyFee.type === 'percent' ? 3 : 4"
              :suffix="form.buyFee.type === 'percent' ? '%' : ''" placeholder="0" fluid />
            <small v-if="form.buyFee.type === 'percent'" class="field-hint text-muted">1 = 100%, 0.1 = 10%, 0.01 = 1%</small>
          </div>
        </div>
        <div class="field">
          <label>Min buy fee <i v-tooltip.focus.top="INFO.minBuyFee" tabindex="0" class="pi pi-info-circle info-icon"/></label>
          <InputNumber v-model="form.buyFee.minFee" :min="0" :max-fraction-digits="2" placeholder="0" fluid />
        </div>
      </div>

      <!-- Sell fee -->
      <div class="fee-section">
        <p class="fee-section-title">Sell Fee <i v-tooltip.focus.top="INFO.sellFee" tabindex="0" class="pi pi-info-circle info-icon"/></p>
        <div class="fields-row">
          <div class="field">
            <label>Type</label>
            <SelectButton v-model="form.sellFee.type" :options="['percent', 'flat']" />
          </div>
          <div class="field">
            <label>{{ form.sellFee.type === 'percent' ? 'Fee %' : 'Flat amount' }}</label>
            <InputNumber v-model="form.sellFee.value" :min="0" :max-fraction-digits="form.sellFee.type === 'percent' ? 3 : 4"
              :suffix="form.sellFee.type === 'percent' ? '%' : ''" placeholder="0" fluid />
            <small v-if="form.sellFee.type === 'percent'" class="field-hint text-muted">1 = 100%, 0.1 = 10%, 0.01 = 1%</small>
          </div>
        </div>
        <div class="field">
          <label>Min sell fee <i v-tooltip.focus.top="INFO.minSellFee" tabindex="0" class="pi pi-info-circle info-icon"/></label>
          <InputNumber v-model="form.sellFee.minFee" :min="0" :max-fraction-digits="2" placeholder="0" fluid />
        </div>
      </div>

      <!-- Capital gains tax -->
      <div class="fee-section">
        <p class="fee-section-title">Capital Gains Tax <i v-tooltip.focus.top="INFO.capitalGainsTax" tabindex="0" class="pi pi-info-circle info-icon"/></p>
        <div class="field">
          <label>Tax rate % <span class="text-muted">(applied to profit on sell)</span></label>
          <InputNumber v-model="form.capitalGainsTax" :min="0" :max="100" :max-fraction-digits="3"
            suffix="%" placeholder="e.g. 25 for Israel" fluid />
        </div>
      </div>

      <div class="field-row-inline">
        <label>Set as default profile</label>
        <ToggleSwitch v-model="form.isDefault" />
      </div>

      <Button fluid label="Save" @click="save"/>
    </div>
  </Dialog>
</template>

<style scoped>
.profile-list { display: flex; flex-direction: column; margin-bottom: 1rem; }
.profile-row { display: flex; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid var(--border); }
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

.fee-form { display: flex; flex-direction: column; gap: 1rem; }
.form-header { display: flex; align-items: center; gap: 0.5rem; }
.form-title { font-weight: 600; font-size: 1rem; color: var(--text-primary); }
.fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label { font-size: 0.82rem; color: var(--text-secondary); }
.field-hint { font-size: 0.72rem; }
.info-icon { font-size: 0.72rem; opacity: 0.55; cursor: pointer; }
.info-icon:hover, .info-icon:focus { opacity: 1; color: var(--accent); outline: none; }
.fee-section { background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem; }
.fee-section-title { font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
.field-row-inline { display: flex; justify-content: space-between; align-items: center; }
.field-row-inline label { font-size: 0.85rem; color: var(--text-secondary); }
</style>
