<script setup>
import ToggleSwitch from 'primevue/toggleswitch'
import {useTheme} from '@/composables/useTheme'
import {useI18n} from '@/composables/useI18n'

const {isLight} = useTheme()
const {t} = useI18n()
</script>

<template>
  <div class="theme-toggle" :title="isLight ? t('account.lightTheme') : t('account.darkTheme')">
    <i class="pi pi-moon"/>
    <ToggleSwitch v-model="isLight" :aria-label="isLight ? t('account.lightTheme') : t('account.darkTheme')"/>
    <i class="pi pi-sun"/>
  </div>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-secondary);
}

.theme-toggle i {
  font-size: 0.78rem;
  line-height: 1;
}

.theme-toggle :deep(.p-toggleswitch) {
  flex-shrink: 0;
}
</style>
