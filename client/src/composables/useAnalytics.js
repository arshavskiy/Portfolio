const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID

let initialized = false

function analyticsEnabled() {
  let loadGA = Boolean(
    import.meta.env.PROD &&
    GA_MEASUREMENT_ID &&
    typeof window !== 'undefined' &&
    navigator.doNotTrack !== '1'
  )
  return loadGA;
}

function loadGtagScript() {
  if (document.querySelector(`script[data-ga-id="${GA_MEASUREMENT_ID}"]`)) return

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`
  script.dataset.gaId = GA_MEASUREMENT_ID
  document.head.appendChild(script)
}

function analyticsUserParams() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    return user?._id ? { user_id: user._id } : {}
  } catch {
    return {}
  }
}

function withUserParams(params = {}) {
  return {
    ...params,
    ...analyticsUserParams(),
  }
}

export function trackPageView(path, title = document.title) {
  if (!analyticsEnabled() || typeof window.gtag !== 'function') return

  window.gtag('event', 'page_view', withUserParams({
    page_path: path,
    page_location: new URL(path, window.location.origin).toString(),
    page_title: title,
  }))
}

export function trackEvent(name, params = {}) {
  if (!analyticsEnabled() || typeof window.gtag !== 'function') return
  window.gtag('event', name, withUserParams(params))
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
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    ...analyticsUserParams(),
  })

  router.afterEach((to) => {
    window.requestAnimationFrame(() => trackPageView(to.fullPath))
  })
}
