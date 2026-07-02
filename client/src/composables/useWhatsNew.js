import {ref} from 'vue'
import {useStorage} from '@vueuse/core'
import {changelog, currentVersion} from '@/data/changelog'

const seenVersion = useStorage('changelog-seen-version', null)
const visible = ref(false)

// Entries the user hasn't acknowledged yet (everything newer than seenVersion).
// Falls back to just the latest entry if the stored version isn't recognised.
function unseenEntries() {
  if (!seenVersion.value) return changelog.slice(0, 1)
  const idx = changelog.findIndex((e) => e.version === seenVersion.value)
  if (idx === -1) return changelog.slice(0, 1)
  return changelog.slice(0, idx)
}

const entries = ref([])

// `?changelog` (any value) forces the full changelog open, bypassing the
// seen-version gate — useful for previewing a release note before it ships.
function forcedParam() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('changelog')
}

function open(all = false) {
  entries.value = all ? changelog : unseenEntries()
  visible.value = true
}

function checkForUpdates() {
  if (!currentVersion) return
  if (forcedParam()) {
    open(true)
    return
  }
  // First-ever load: don't greet brand-new users with a changelog.
  if (seenVersion.value === null) {
    seenVersion.value = currentVersion
    return
  }
  if (seenVersion.value !== currentVersion) {
    open()
  }
}

function dismiss() {
  seenVersion.value = currentVersion
  visible.value = false
  // Drop the force param so it doesn't re-open on the next mount/navigation.
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    if (url.searchParams.has('changelog')) {
      url.searchParams.delete('changelog')
      window.history.replaceState(window.history.state, '', url)
    }
  }
}

export function useWhatsNew() {
  return {visible, entries, checkForUpdates, dismiss, open}
}
