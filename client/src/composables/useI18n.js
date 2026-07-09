import {storeToRefs} from 'pinia'
import {useLocaleStore} from '@/stores/locale'

export function useI18n() {
    const localeStore = useLocaleStore()
    const {locale, localeInfo, supportedLocales} = storeToRefs(localeStore)
    
    return {
        locale,
        localeInfo,
        supportedLocales,
        setLocale: localeStore.setLocale,
        t: localeStore.t,
    }
}
