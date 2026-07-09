<script setup>
import {computed, ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useAlertsStore} from '@/stores/alerts'
import {usePush} from '@/composables/usePush'
import {useTickerCurrency} from '@/composables/useFormat'
import {trackEvent} from '@/composables/useAnalytics'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import Message from 'primevue/message'
import {useI18n} from '@/composables/useI18n'

const props = defineProps({
  visible: Boolean,
  ticker: {type: String, required: true},
  currentPrice: {type: Number, default: null},
})
const emit = defineEmits(['update:visible'])

const toast = useToast()
const alerts = useAlertsStore()
const {supported, subscribed, busy, refreshState, enablePush} = usePush()
const {t} = useI18n()

const condition = ref('above')
const target = ref(null)
const loading = ref(false)
const deleting = ref(false)
const editingAlertId = ref(null)

const conditionOptions = computed(() => [
  {label: t('alerts.above'), value: 'above'},
  {label: t('alerts.below'), value: 'below'},
])

const isIls = computed(() => props.ticker?.toUpperCase().endsWith('.TA'))
const existingAlerts = computed(() =>
  alerts.forTicker(props.ticker)
    .filter((alert) => alert.active !== false)
    .sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0))
)

watch(() => props.visible, (v) => {
  if (v) openModal()
})

async function openModal() {
  await alerts.fetchAlerts().catch(() => {})
  resetForm()
  refreshState()
}

function resetForm() {
  editingAlertId.value = null
  condition.value = 'above'
  target.value = props.currentPrice ? Math.round(props.currentPrice * 100) / 100 : null
}

function editAlert(alert) {
  editingAlertId.value = alert._id
  condition.value = alert.condition || 'above'
  target.value = alert.target ?? null
}

const editingAlert = computed(() =>
  existingAlerts.value.find((alert) => alert._id === editingAlertId.value) || null
)

async function submit() {
  if (target.value == null) {
    toast.add({severity: 'warn', summary: t('alerts.enterTarget'), life: 2000})
    return
  }
  loading.value = true
  try {
    if (editingAlert.value) {
      await alerts.updateAlert(editingAlert.value._id, {ticker: props.ticker, condition: condition.value, target: target.value})
      toast.add({severity: 'success', summary: t('alerts.updatedFor', {ticker: props.ticker}), life: 2000})
      trackEvent('update_alert', {ticker: props.ticker})
    } else {
      await alerts.createAlert({ticker: props.ticker, condition: condition.value, target: target.value})
      toast.add({severity: 'success', summary: t('alerts.setFor', {ticker: props.ticker}), life: 2000})
      trackEvent('create_alert', {ticker: props.ticker})
    }
    emit('update:visible', false)
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  } finally {
    loading.value = false
  }
}

async function removeSpecificAlert(alert) {
  if (!alert?._id) return
  deleting.value = alert._id
  try {
    await alerts.deleteAlert(alert._id)
    toast.add({severity: 'info', summary: t('alerts.removedFor', {ticker: props.ticker}), life: 2000})
    if (editingAlertId.value === alert._id) resetForm()
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  } finally {
    deleting.value = false
  }
}

function formatAlertTarget(alert) {
  return `${alert.condition === 'below' ? t('alerts.below') : t('alerts.above')} ${useTickerCurrency(alert.target, props.ticker)}`
}

async function turnOnPush() {
  try {
    await enablePush()
    toast.add({severity: 'success', summary: t('alerts.enabled'), life: 2000})
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  }
}
</script>

<template>
  <Dialog
      :draggable="false"
      :header="`Alert · ${ticker}`"
      :style="{ width: '95vw', maxWidth: '380px' }"
      :visible="visible"
      modal
      @update:visible="emit('update:visible', $event)"
  >
    <div class="form">
      <p v-if="currentPrice != null" class="current text-muted">
        {{ t('alerts.currentPrice') }} <strong>{{ useTickerCurrency(currentPrice, ticker) }}</strong>
      </p>

      <div v-if="existingAlerts.length" class="existing-alerts">
        <div class="existing-title text-muted">{{ t('alerts.existing') }}</div>
        <div class="existing-list">
          <div v-for="alert in existingAlerts" :key="alert._id" class="existing-item">
            <button
              type="button"
              class="existing-main"
              :class="{ active: editingAlertId === alert._id }"
              @click="editAlert(alert)"
            >
              <span class="existing-label">{{ formatAlertTarget(alert) }}</span>
              <span class="existing-action text-muted">{{ t('common.edit') }}</span>
            </button>
            <Button
              :loading="deleting === alert._id"
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              size="small"
              @click="removeSpecificAlert(alert)"
            />
          </div>
        </div>
      </div>

      <div class="field">
        <label>{{ t('alerts.notifyWhen') }}</label>
        <SelectButton v-model="condition" :allow-empty="false" :options="conditionOptions" option-label="label"
                      option-value="value"/>
      </div>

      <div class="field">
        <label>{{ t('alerts.targetPrice') }} ({{ isIls ? '₪' : '$' }})</label>
        <InputNumber v-model="target" :max-fraction-digits="4" :min="0" :placeholder="isIls ? '₪0.00' : '$0.00'" fluid/>
      </div>

      <Message v-if="supported && !subscribed" :closable="false" severity="warn">
        {{ t('alerts.pushOffWarning') }}
        <Button :label="t('alerts.enablePush')" :loading="busy" size="small" text @click="turnOnPush"/>
      </Message>
      <Message v-else-if="!supported" :closable="false" severity="info">
        {{ t('alerts.pushNotSupportedInApp') }}
      </Message>

      <div class="actions">
        <Button :label="editingAlert ? t('alerts.updateAlert') : t('alerts.createAlert')" :loading="loading" fluid
                outlined @click="submit"/>
        <Button
          v-if="editingAlert"
          fluid
          :label="t('alerts.createNew')"
          text
          @click="resetForm"
        />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.form {
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

.current {
  font-size: 0.85rem;
}

.existing-alerts {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.existing-title {
  font-size: 0.8rem;
}

.existing-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.existing-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.existing-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
}

.existing-main.active .existing-label {
  color: var(--text-primary);
}

.existing-label {
  font-size: 0.85rem;
  font-weight: 600;
}

.existing-action {
  font-size: 0.75rem;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
