import {useRouter} from 'vue-router'
import {useBreakpoint} from '@/composables/useBreakpoint'
import {useDesktopFocusStore} from '@/stores/desktopFocus'

export function useNavigateToPosition() {
  const router = useRouter()
  const {isDesktop} = useBreakpoint()

  function openPosition(ticker, companyName = '') {
    if (isDesktop.value) {
      const focus = useDesktopFocusStore()
      focus.focus(ticker.toUpperCase(), companyName)
    } else {
      router.push(`/position/${encodeURIComponent(ticker)}`)
    }
  }

  return {openPosition}
}
