<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useFeeProfileStore } from '@/stores/feeProfiles'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import Select from 'primevue/select'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['update:visible'])

const toast = useToast()
const store = useFeeProfileStore()

const editing = ref(null)
const form = ref(defaultForm())

const COUNTRIES = [
  { label: 'Israel', value: 'Israel', tax: 25 },
  { label: 'USA', value: 'USA', tax: 20 },
  { label: 'UK', value: 'UK', tax: 20 },
  { label: 'Germany', value: 'Germany', tax: 26.375 },
  { label: 'Other', value: 'Other', tax: 0 },
]

function defaultForm() {
  return {
    name: '',
    country: '',
    currency: 'USD',
    buyFee: { type: 'percent', value: 0, minFee: 0 },
    sellFee: { type: 'percent', value: 0, minFee: 0 },
    capitalGainsTax: 0,
    isDefault: false,
  }
}

onMounted(() => { if (!store.profiles.length) store.fetchProfiles() })

function openNew() { editing.value = 'new'; form.value = defaultForm() }
function openEdit(p) {
  editing.value = p
  form.value = {
    name: p.name,
    country: p.country || '',
    currency: p.currency || 'USD',
    buyFee: { ...p.buyFee },
    sellFee: { ...p.sellFee },
    capitalGainsTax: p.capitalGainsTax || 0,
    isDefault: p.isDefault,
  }
}
function closeEdit() { editing.value = null }

function onCountryChange(val) {
  const c = COUNTRIES.find((c) => c.value === val)
  if (c) form.value.capitalGainsTax = c.tax
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
  try {
    await store.deleteProfile(p._id)
    toast.add({ severity: 'success', summary: 'Deleted', life: 2000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: err.message, life: 3000 })
  }
}

function feeLabel(p) {
  const buy = p.buyFee?.value ? `Buy ${p.buyFee.type === 'percent' ? p.buyFee.value + '%' : p.buyFee.value}` : null
  const sell = p.sellFee?.value ? `Sell ${p.sellFee.type === 'percent' ? p.sellFee.value + '%' : p.sellFee.value}` : null
  const tax = p.capitalGainsTax ? `Tax ${p.capitalGainsTax}%` : null
  return [buy, sell, tax].filter(Boolean).join(' · ') || 'No fees'
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
      <div v-else-if="!store.profiles.length" class="empty">
        <p class="text-muted">No fee profiles yet. Add one to track brokerage costs.</p>
      </div>
      <div v-else class="profile-list">
        <div v-for="p in store.profiles" :key="p._id" class="profile-row">
          <div class="profile-info" @click="openEdit(p)">
            <span class="profile-name">
              {{ p.name }}
              <span v-if="p.isDefault" class="default-badge">Default</span>
            </span>
            <span class="profile-detail text-muted">{{ feeLabel(p) }}</span>
            <span v-if="p.country" class="profile-country text-muted">{{ p.country }}</span>
          </div>
          <Button icon="pi pi-trash" text rounded size="small" severity="danger" @click="remove(p)" />
        </div>
      </div>
      <Button label="Add Profile" icon="pi pi-plus" fluid class="mt" @click="openNew" />
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

      <div class="fields-row">
        <div class="field">
          <label>Country</label>
          <Select
            v-model="form.country"
            :options="COUNTRIES"
            option-label="label"
            option-value="value"
            placeholder="Select..."
            fluid
            @change="onCountryChange(form.country)"
          />
        </div>
        <div class="field">
          <label>Currency</label>
          <SelectButton v-model="form.currency" :options="['USD', 'ILS', 'EUR']" />
        </div>
      </div>

      <!-- Buy fee -->
      <div class="fee-section">
        <p class="fee-section-title">Buy Fee</p>
        <div class="fields-row">
          <div class="field">
            <label>Type</label>
            <SelectButton v-model="form.buyFee.type" :options="['percent', 'flat']" />
          </div>
          <div class="field">
            <label>{{ form.buyFee.type === 'percent' ? 'Fee %' : 'Flat amount' }}</label>
            <InputNumber v-model="form.buyFee.value" :min="0" :max-fraction-digits="4"
              :suffix="form.buyFee.type === 'percent' ? '%' : ''" placeholder="0" fluid />
          </div>
        </div>
        <div class="field">
          <label>Min buy fee</label>
          <InputNumber v-model="form.buyFee.minFee" :min="0" :max-fraction-digits="2" placeholder="0" fluid />
        </div>
      </div>

      <!-- Sell fee -->
      <div class="fee-section">
        <p class="fee-section-title">Sell Fee</p>
        <div class="fields-row">
          <div class="field">
            <label>Type</label>
            <SelectButton v-model="form.sellFee.type" :options="['percent', 'flat']" />
          </div>
          <div class="field">
            <label>{{ form.sellFee.type === 'percent' ? 'Fee %' : 'Flat amount' }}</label>
            <InputNumber v-model="form.sellFee.value" :min="0" :max-fraction-digits="4"
              :suffix="form.sellFee.type === 'percent' ? '%' : ''" placeholder="0" fluid />
          </div>
        </div>
        <div class="field">
          <label>Min sell fee</label>
          <InputNumber v-model="form.sellFee.minFee" :min="0" :max-fraction-digits="2" placeholder="0" fluid />
        </div>
      </div>

      <!-- Capital gains tax -->
      <div class="fee-section">
        <p class="fee-section-title">Capital Gains Tax</p>
        <div class="field">
          <label>Tax rate % <span class="text-muted">(applied to profit on sell)</span></label>
          <InputNumber v-model="form.capitalGainsTax" :min="0" :max="100" :max-fraction-digits="3"
            suffix="%" placeholder="e.g. 25 for Israel" fluid />
        </div>
      </div>

      <div class="field-row-inline">
        <label>Set as default</label>
        <ToggleSwitch v-model="form.isDefault" />
      </div>

      <Button label="Save" fluid @click="save" />
    </div>
  </Dialog>
</template>

<style scoped>
.profile-list { display: flex; flex-direction: column; margin-bottom: 1rem; }
.profile-row { display: flex; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid var(--border); }
.profile-info { flex: 1; display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
.profile-name { font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; }
.default-badge { font-size: 0.68rem; background: var(--accent); color: #fff; border-radius: 4px; padding: 1px 6px; }
.profile-detail { font-size: 0.78rem; }
.profile-country { font-size: 0.75rem; }
.empty { padding: 0.5rem 0 1rem; }
.mt { margin-top: 0.5rem; }

.fee-form { display: flex; flex-direction: column; gap: 1rem; }
.form-header { display: flex; align-items: center; gap: 0.5rem; }
.form-title { font-weight: 600; font-size: 1rem; }
.fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label { font-size: 0.82rem; color: var(--text-secondary); }
.fee-section { background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem; }
.fee-section-title { font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
.field-row-inline { display: flex; justify-content: space-between; align-items: center; }
.field-row-inline label { font-size: 0.85rem; color: var(--text-secondary); }
</style>
