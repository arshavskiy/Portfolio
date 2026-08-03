<script setup>
import {useI18n} from '@/composables/useI18n'
import Dialog from 'primevue/dialog'
import HelpView from '@/views/HelpView.vue'

const visible = defineModel('visible', {type: Boolean, default: false})
defineProps({
  fromAccount: {type: Boolean, default: false},
})
const emit = defineEmits(['back-to-account'])

const {t} = useI18n()

function backToAccount() {
  visible.value = false
  emit('back-to-account')
}
</script>

<template>
  <Dialog
      v-model:visible="visible"
      :draggable="false"
      :style="{ width: '95vw', maxWidth: '900px' }"
      modal
  >
    <template #header>
      <nav v-if="fromAccount" class="modal-crumbs">
        <button class="crumb-back" type="button" @click="backToAccount">
          <i class="pi pi-chevron-left"/>
          <span>{{ t('common.account') }}</span>
        </button>
        <span class="crumb-sep">›</span>
        <span class="gradient-title">{{ t('common.about') }}</span>
      </nav>
      <span v-else class="gradient-title">{{ t('common.about') }}</span>
    </template>

    <HelpView embedded/>
  </Dialog>
</template>

<style scoped>
.modal-crumbs {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.crumb-back {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.35rem;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}

.crumb-back:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--text-primary) 6%, transparent);
}

.crumb-back i {
  font-size: 0.7rem;
}

.crumb-sep {
  color: var(--text-secondary);
  font-size: 0.85rem;
  opacity: 0.45;
  user-select: none;
}
</style>
