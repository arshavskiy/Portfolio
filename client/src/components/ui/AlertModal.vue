<script setup>
import {computed, ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useAlertsStore} from '@/stores/alerts'
import {usePush} from '@/composables/usePush'
import {useTickerCurrency} from '@/composables/useFormat'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import Message from 'primevue/message'

const props = defineProps({
  visible: Boolean,
  ticker: {type: String, required: true},
  currentPrice: {type: Number, default: null},
})
const emit = defineEmits(['update:visible'])

const toast = useToast()
const alerts = useAlertsStore()
const {supported, subscribed, busy, refreshState, enablePush} = usePush()

const condition = ref('above')
const target = ref(null)
const loading = ref(false)

const conditionOptions = [
  {label: 'Above', value: 'above'},
  {label: 'Below', value: 'below'},
]

const isIls = computed(() => props.ticker?.toUpperCase().endsWith('.TA'))

watch(() => props.visible, (v) => {
  if (v) {
    condition.value = 'above'
    target.value = props.currentPrice ? Math.round(props.currentPrice * 100) / 100 : null
    refreshState()
  }
})

async function submit() {
  if (target.value == null) {
    toast.add({severity: 'warn', summary: 'Enter a target price', life: 2000})
    return
  }
  loading.value = true
  try {
    await alerts.createAlert({ticker: props.ticker, condition: condition.value, target: target.value})
    toast.add({severity: 'success', summary: `Alert set for ${props.ticker}`, life: 2000})
    emit('update:visible', false)
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  } finally {
    loading.value = false
  }
}

async function turnOnPush() {
  try {
    await enablePush()
    toast.add({severity: 'success', summary: 'Push notifications enabled', life: 2000})
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
        Current price: <strong>{{ useTickerCurrency(currentPrice, ticker) }}</strong>
      </p>

      <div class="field">
        <label>Notify me when price is</label>
        <SelectButton v-model="condition" :allow-empty="false" :options="conditionOptions" option-label="label"
                      option-value="value"/>
      </div>

      <div class="field">
        <label>Target price ({{ isIls ? '₪' : '$' }})</label>
        <InputNumber v-model="target" :max-fraction-digits="4" :min="0" :placeholder="isIls ? '₪0.00' : '$0.00'" fluid/>
      </div>

      <Message v-if="supported && !subscribed" :closable="false" severity="warn">
        Push notifications are off — you won't be alerted on your device.
        <Button :loading="busy" label="Enable push" size="small" text @click="turnOnPush"/>
      </Message>
      <Message v-else-if="!supported" :closable="false" severity="info">
        This device doesn't support push. Alerts still show in-app.
      </Message>

      <Button :loading="loading" fluid label="Create Alert" @click="submit"/>
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
</style>
