import {computed, ref} from 'vue'

const STORAGE_KEY = 'stockfolio-theme'
const DARK_THEME_COLOR = '#000000'
const LIGHT_THEME_COLOR = '#f8fafc'
const theme = ref(resolveInitialTheme())

function resolveInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark'
}

function applyTheme(value) {
  if (typeof document === 'undefined') return
  const isDark = value !== 'light'
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.classList.toggle('light', !isDark)
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
}

function setTheme(value) {
  theme.value = value === 'light' ? 'light' : 'dark'
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, theme.value)
  applyTheme(theme.value)
}

export function useTheme() {
  applyTheme(theme.value)

  const isLight = computed({
    get: () => theme.value === 'light',
    set: (value) => setTheme(value ? 'light' : 'dark'),
  })

  return {
    theme,
    isLight,
    setTheme,
    toggleTheme: () => setTheme(theme.value === 'light' ? 'dark' : 'light'),
  }
}
