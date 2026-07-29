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
  border: 2px solid color-mix(in srgb, var(--neon-blue) 14%, transparent);
  border-top-color: var(--neon-blue);
  border-right-color: var(--purple);
  box-shadow: 0 0 12px color-mix(in srgb, var(--neon-blue) 22%, transparent), inset 0 0 8px color-mix(in srgb, var(--purple) 8%, transparent);
  animation: appSpin 0.75s linear infinite;
}

@keyframes appSpin {
  to {
    transform: rotate(360deg);
  }
}
</style>
