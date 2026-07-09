<script setup>
import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { usePwaInstall } from '@/composables/usePwa'
import {useI18n} from '@/composables/useI18n'
import Button from 'primevue/button'

const { canInstall, installed, promptInstall } = usePwaInstall()
const { isAuthenticated } = storeToRefs(useAuthStore())
const dismissed = useStorage('install-banner-dismissed', false)
const {t} = useI18n()

const show = computed(() => canInstall.value && !installed.value && isAuthenticated.value && !dismissed.value)

async function install() {
  await promptInstall()
}
function dismiss() {
  dismissed.value = true
}
</script>

<template>
  <Transition name="slide-up">
    <div v-if="show" class="install-banner safe-bottom-banner">
      <div class="ib-text">
        <i class="pi pi-download" />
        <div>
          <div class="ib-title">{{ t('pwa.installTitle') }}</div>
          <div class="ib-sub text-muted">{{ t('pwa.installBody') }}</div>
        </div>
      </div>
      <div class="ib-actions">
        <Button :label="t('pwa.install')" outlined size="small" @click="install"/>
        <button class="ib-close" @click="dismiss"><i class="pi pi-times" /></button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.install-banner {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--nav-height) + var(--safe-bottom) + 0.5rem);
  margin: 0 0.75rem;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
  background: var(--bg-secondary);
  border: 1px solid var(--accent);
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
}
@media (min-width: 1024px) {
  /* Desktop sidebar: no bottom nav to clear, anchor bottom-right. */
  .install-banner {
    left: auto;
    right: 1rem;
    bottom: 1rem;
    max-width: 360px;
    margin: 0;
  }
}

.ib-text { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
.ib-text > i { font-size: 1.3rem; color: var(--accent); flex-shrink: 0; }
.ib-title { font-weight: 700; font-size: 0.9rem; }
.ib-sub { font-size: 0.74rem; }
.ib-actions { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
.ib-close {
  background: none; border: none; color: var(--text-secondary);
  cursor: pointer; padding: 6px; line-height: 1; font-size: 0.85rem;
}

.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.25s, opacity 0.25s; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(20px); opacity: 0; }
</style>
