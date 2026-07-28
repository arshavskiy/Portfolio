<script setup>
import {onMounted, onUnmounted} from 'vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import {useAlertNotifier} from '@/composables/useAlertNotifier'
import InstallBanner from '@/components/ui/InstallBanner.vue'
import PwaUpdateBanner from '@/components/ui/PwaUpdateBanner.vue'
import {useTheme} from '@/composables/useTheme'

useAlertNotifier()
useTheme()

// Browsers block requestFullscreen() without a user gesture, so we trigger it
// on the very first tap/click. Skipped when already running as an installed
// PWA (display: fullscreen/standalone already gives a chrome-less view).
function isStandalone() {
  return window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
}

async function enterFullscreenOnce() {
  cleanupFs()
  if (sessionStorage.getItem('fs-tried')) return
  sessionStorage.setItem('fs-tried', '1')
  const el = document.documentElement
  try {
    if (el.requestFullscreen) await el.requestFullscreen()
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
  } catch { /* denied — ignore */ }
}

function cleanupFs() {
  window.removeEventListener('pointerdown', enterFullscreenOnce)
}

onMounted(() => {
  if (!isStandalone() && document.documentElement.requestFullscreen) {
    window.addEventListener('pointerdown', enterFullscreenOnce, { once: true })
  }
  // Fallback signal for the splash screen (index.html): by the time the
  // root component mounts, any child view's onMounted fetch has already
  // been kicked off, so the network-idle tracker has something to wait on.
  // Covers routes that fetch nothing at all, where idle would never trigger.
  window.dispatchEvent(new Event('app:ready'))
})
onUnmounted(cleanupFs)
</script>

<template>
  <Toast position="top-center" />
  <ConfirmDialog />
  <RouterView />
  <InstallBanner />
  <PwaUpdateBanner />
</template>
