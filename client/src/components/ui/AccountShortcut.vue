<script setup>
import {useI18n} from '@/composables/useI18n'
import {trackEvent} from '@/composables/useAnalytics'

const {t} = useI18n()

const emit = defineEmits(['click'])

function onClick() {
  trackEvent('nav_click', {nav_item: 'account'})
  emit('click')
}
</script>

<template>
  <button
      :aria-label="t('common.account')"
      class="account-shortcut"
      data-tour="nav-account"
      type="button"
      @click="onClick"
  >
    <i class="pi pi-user"/>
  </button>
</template>

<style scoped>
.account-shortcut {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 0.75rem);
  right: 1rem;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: color-mix(in srgb, var(--bg-card) 85%, transparent);
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}

.account-shortcut i {
  font-size: 1.05rem;
}

.account-shortcut:hover {
  color: var(--neon-blue);
  border-color: rgba(0, 207, 255, 0.45);
  box-shadow: 0 0 10px rgba(0, 207, 255, 0.25);
}

@media (min-width: 1024px) {
  .account-shortcut {
    display: none;
  }
}
</style>
