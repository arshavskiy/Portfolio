import {computed} from 'vue'
import {useStorage} from '@vueuse/core'

export const PORTFOLIO_DISPLAY_CURRENCY_KEY = 'portfolio-display-currency'
export const PORTFOLIO_DISPLAY_CURRENCIES = [
  {label: 'USD $', value: 'USD'},
  {label: 'ILS ₪', value: 'ILS'},
]

const displayCurrency = useStorage(PORTFOLIO_DISPLAY_CURRENCY_KEY, 'USD')

function normalizeCurrency(value) {
  return value === 'ILS' ? 'ILS' : 'USD'
}

export function usePortfolioDisplayCurrency() {
  const currency = computed({
    get: () => normalizeCurrency(displayCurrency.value),
    set: (value) => {
      displayCurrency.value = normalizeCurrency(value)
    },
  })

  function convertUsd(value, ilsToUsd) {
    const amount = Number(value) || 0
    const rate = Number(ilsToUsd)
    if (currency.value === 'ILS' && rate > 0) return amount / rate
    return amount
  }

  function displayCurrencyForRate(ilsToUsd) {
    return currency.value === 'ILS' && Number(ilsToUsd) > 0 ? 'ILS' : 'USD'
  }

  return {
    currency,
    options: PORTFOLIO_DISPLAY_CURRENCIES,
    convertUsd,
    displayCurrencyForRate,
  }
}
