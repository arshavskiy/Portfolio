import {defineStore} from 'pinia'
import {ref} from 'vue'

export const useDesktopFocusStore = defineStore('desktopFocus', () => {
  const ticker = ref(null)
  const companyName = ref('')

  function focus(t, name = '') {
    ticker.value = t
    companyName.value = name
  }

  function clear() {
    ticker.value = null
    companyName.value = ''
  }

  return {ticker, companyName, focus, clear}
})
