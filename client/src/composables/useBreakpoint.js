import {ref, onMounted, onUnmounted} from 'vue'

const DESKTOP_BP = 1024

const isDesktop = ref(typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BP)

let listeners = 0

function onResize() {
  isDesktop.value = window.innerWidth >= DESKTOP_BP
}

export function useBreakpoint() {
  onMounted(() => {
    if (++listeners === 1) window.addEventListener('resize', onResize)
  })
  onUnmounted(() => {
    if (--listeners === 0) window.removeEventListener('resize', onResize)
  })
  return {isDesktop}
}
