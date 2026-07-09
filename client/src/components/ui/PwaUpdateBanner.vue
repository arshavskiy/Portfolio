<script setup>
import {onMounted, onUnmounted, ref} from 'vue'
import {useI18n} from '@/composables/useI18n'
import Button from 'primevue/button'

const showUpdate = ref(false)
const {t} = useI18n()
let checkingTimer = null
let refreshing = false

function hasServiceWorker() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator
}

function isInstalledPwa() {
  return window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
}

function requestReload() {
  refreshing = true
  window.location.reload()
}

function showReloadPrompt() {
  if (refreshing) return
  showUpdate.value = true
}

function watchInstallingWorker(worker) {
  if (!worker) return
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      showReloadPrompt()
    }
  })
}

async function checkForUpdate() {
  if (!hasServiceWorker() || !isInstalledPwa()) return
  try {
    const registration = await navigator.serviceWorker.ready
    await registration.update()
  } catch {
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') checkForUpdate()
}

onMounted(async () => {
  if (!hasServiceWorker() || !isInstalledPwa()) return

  const hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showReloadPrompt()
  })

  try {
    const registration = await navigator.serviceWorker.ready
    watchInstallingWorker(registration.installing)
    registration.addEventListener('updatefound', () => {
      watchInstallingWorker(registration.installing)
    })
    await registration.update()
  } catch {
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  checkingTimer = window.setInterval(checkForUpdate, 30 * 60 * 1000)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (checkingTimer) window.clearInterval(checkingTimer)
})
</script>

<template>
  <Transition name="slide-up">
    <div v-if="showUpdate" class="update-banner">
      <div class="ub-text">
        <i class="pi pi-refresh"/>
        <div>
          <div class="ub-title">{{ t('pwa.updateTitle') }}</div>
          <div class="ub-sub text-muted">{{ t('pwa.updateBody') }}</div>
        </div>
      </div>
      <div class="ub-actions">
        <Button :label="t('pwa.refresh')" outlined size="small" @click="requestReload"/>
        <button class="ub-close" type="button" @click="showUpdate = false">
          <i class="pi pi-times"/>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.update-banner {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--nav-height) + var(--safe-bottom) + 0.5rem);
  margin: 0 0.75rem;
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
  background: var(--bg-secondary);
  border: 1px solid var(--neon-green);
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
}

@media (min-width: 1024px) {
  .update-banner {
    left: auto;
    right: 1rem;
    bottom: 1rem;
    max-width: 360px;
    margin: 0;
  }
}

.ub-text {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.ub-text > i {
  flex-shrink: 0;
  color: var(--neon-green);
  font-size: 1.25rem;
}

.ub-title {
  font-size: 0.9rem;
  font-weight: 700;
}

.ub-sub {
  font-size: 0.74rem;
}

.ub-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.ub-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
  padding: 6px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.25s, opacity 0.25s;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
