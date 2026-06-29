const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID

let initialized = false

function analyticsEnabled() {
  return Boolean(
    import.meta.env.PROD &&
    GA_MEASUREMENT_ID &&
    typeof window !== 'undefined' &&
    navigator.doNotTrack !== '1'
  )
}

function loadGtagScript() {
  if (document.querySelector(`script[data-ga-id="${GA_MEASUREMENT_ID}"]`)) return

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`
  script.dataset.gaId = GA_MEASUREMENT_ID
  document.head.appendChild(script)
}

export function trackPageView(path, title = document.title) {
  if (!analyticsEnabled() || typeof window.gtag !== 'function') return

  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: new URL(path, window.location.origin).toString(),
    page_title: title,
  })
}

export function installAnalytics(router) {
  if (!analyticsEnabled() || initialized) return
  initialized = true

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }

  loadGtagScript()
  window.gtag('js', new Date())
  window.gtag('config', GA_MEASUREMENT_ID, {send_page_view: false})

  router.afterEach((to) => {
    window.requestAnimationFrame(() => trackPageView(to.fullPath))
  })
}
