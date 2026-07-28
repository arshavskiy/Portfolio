<script setup>
import {computed} from 'vue'
import {useI18n} from '@/composables/useI18n'
import {trackEvent} from '@/composables/useAnalytics'
import {useAuthStore} from '@/stores/auth'

const {t} = useI18n()
const auth = useAuthStore()
const userType = computed(() => auth.userType)
const userTypeShortLabel = computed(() => t(`account.userTypesShort.${userType.value}`))

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
      :title="`${t('common.account')} · ${t(`account.userTypes.${userType}`)}`"
      type="button"
      @click="onClick"
  >
    <i class="pi pi-user"/>
    <span :class="`type-badge type-badge-${userType}`">{{ userTypeShortLabel }}</span>
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

.type-badge {
  position: absolute;
  right: -4px;
  bottom: -2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 16px;
  padding: 0 0.3rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.5rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.04em;
}

.type-badge-regular {
  color: var(--neon-blue);
}

.type-badge-pro {
  color: #4ade80;
}

.type-badge-max {
  color: #fbbf24;
}

.type-badge-admin {
  color: #f87171;
}

.type-badge-plan {
  color: #c084fc;
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
