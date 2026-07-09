import {defineStore} from 'pinia'
import {computed, ref, watch} from 'vue'
import {defaultLocale, messages, supportedLocales} from '@/i18n/messages'

const STORAGE_KEY = 'stockfolio-locale'

function initialLocale() {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && messages[saved]) return saved
    
    const browserLocale = navigator.language?.slice(0, 2)
    if (browserLocale && messages[browserLocale]) return browserLocale
    
    return defaultLocale
}

function readPath(source, key) {
    return key.split('.').reduce((value, segment) => value?.[segment], source)
}

function formatMessage(template, params = {}) {
    if (typeof template !== 'string') return template
    return template.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '')
}

export const useLocaleStore = defineStore('locale', () => {
    const locale = ref(initialLocale())
    
    const localeInfo = computed(() =>
        supportedLocales.find((item) => item.code === locale.value) || supportedLocales[0]
    )
    
    function setLocale(nextLocale) {
        if (!messages[nextLocale]) return
        locale.value = nextLocale
    }
    
    function t(key, params) {
        const translated = readPath(messages[locale.value], key)
        const fallback = readPath(messages[defaultLocale], key)
        return formatMessage(translated ?? fallback ?? key, params)
    }
    
    watch(locale, (nextLocale) => {
        localStorage.setItem(STORAGE_KEY, nextLocale)
        document.documentElement.lang = nextLocale
    }, {immediate: true})
    
    return {
        locale,
        localeInfo,
        supportedLocales,
        setLocale,
        t,
    }
})
