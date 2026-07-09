<script setup>
import {useI18n} from '@/composables/useI18n'

const {t} = useI18n()
</script>

<template>
  <span :aria-label="t('common.loading')" class="app-loader"/>
</template>

<style scoped>
.app-loader {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid rgba(0, 207, 255, 0.14);
  border-top-color: var(--neon-blue);
  border-right-color: #a855f7;
  box-shadow: 0 0 12px rgba(0, 207, 255, 0.22), inset 0 0 8px rgba(168, 85, 247, 0.08);
  animation: appSpin 0.75s linear infinite;
}

@keyframes appSpin {
  to {
    transform: rotate(360deg);
  }
}
</style>
