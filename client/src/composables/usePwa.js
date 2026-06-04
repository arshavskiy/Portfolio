import { ref, onMounted, onUnmounted } from 'vue'

// ── Install prompt (beforeinstallprompt) ──
// Captured once at module load so the event isn't missed before a component mounts.
const deferredPrompt = ref(null)
const canInstall = ref(false)
const installed = ref(false)

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
}

if (typeof window !== 'undefined') {
  installed.value = isStandalone()
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e
    canInstall.value = true
  })
  window.addEventListener('appinstalled', () => {
    canInstall.value = false
    installed.value = true
    deferredPrompt.value = null
  })
}

async function promptInstall() {
  if (!deferredPrompt.value) return false
  deferredPrompt.value.prompt()
  const { outcome } = await deferredPrompt.value.userChoice
  deferredPrompt.value = null
  canInstall.value = false
  return outcome === 'accepted'
}

// iOS doesn't support beforeinstallprompt — detect so we can show manual hint.
const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

export function usePwaInstall() {
  return { canInstall, installed, isIos, promptInstall }
}

// ── Fullscreen API ──
export function useFullscreen() {
  const isFullscreen = ref(false)
  const supported = typeof document !== 'undefined' &&
    (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)

  function sync() {
    isFullscreen.value = !!(document.fullscreenElement || document.webkitFullscreenElement)
  }

  async function enter() {
    const el = document.documentElement
    try {
      if (el.requestFullscreen) await el.requestFullscreen()
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
    } catch { /* user may deny */ }
  }

  async function exit() {
    try {
      if (document.exitFullscreen) await document.exitFullscreen()
      else if (document.webkitExitFullscreen) await document.webkitExitFullscreen()
    } catch {}
  }

  function toggle() {
    return isFullscreen.value ? exit() : enter()
  }

  onMounted(() => {
    sync()
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
  })
  onUnmounted(() => {
    document.removeEventListener('fullscreenchange', sync)
    document.removeEventListener('webkitfullscreenchange', sync)
  })

  return { isFullscreen, supported: !!supported, enter, exit, toggle }
}
