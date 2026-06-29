import {PrimeVueToastSymbol} from 'primevue/usetoast'

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      status: error.status,
      responseData: error.responseData,
    }
  }

  if (typeof error === 'string') return {message: error}

  return {
    message: error?.message || 'Unknown client error',
    detail: error,
  }
}

export function logClientError(error, context = 'Client error', extra = {}) {
  console.error(`[StockFolio] ${context}`, {
    ...normalizeError(error),
    ...extra,
  })
}

function suppressErrorToasts(app) {
  const toast = app.config.globalProperties.$toast
  if (!toast?.add) return

  const originalAdd = toast.add.bind(toast)
  toast.add = (message) => {
    if (message?.severity === 'error') {
      logClientError(new Error(message.detail || message.summary || 'Toast error'), 'Suppressed error toast', {toast: message})
      return
    }
    originalAdd(message)
  }

  app.provide(PrimeVueToastSymbol, toast)
}

export function installClientErrorLogging(app) {
  suppressErrorToasts(app)

  app.config.errorHandler = (error, instance, info) => {
    logClientError(error, 'Vue error', {
      info,
      component: instance?.$options?.name,
    })
  }

  window.addEventListener('error', (event) => {
    logClientError(event.error || event.message, 'Window error', {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    logClientError(event.reason, 'Unhandled promise rejection')
  })
}
