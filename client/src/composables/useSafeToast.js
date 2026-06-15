import {useToast} from 'primevue/usetoast'

export function useSafeToast() {
  try {
    return useToast()
  } catch {
    return {
      add: () => {},
      remove: () => {},
      removeGroup: () => {},
      removeAllGroups: () => {},
    }
  }
}
