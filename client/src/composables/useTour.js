import {driver} from 'driver.js'
import 'driver.js/dist/driver.css'
import '@/assets/tour.css'
import {useRouter} from 'vue-router'
import {useDesktopFocusStore} from '@/stores/desktopFocus'

const SEEN_KEY = 'stockfolio-tour-seen'
let tourRunning = false

// Phase 1 — cross-section overview, anchored to the nav (Dashboard route).
function navSteps() {
  return [
    {
      element: '[data-tour="nav-dashboard"]',
      popover: {
        title: '👋 Welcome to StockFolio',
        description: 'Your Dashboard shows portfolio value, P&L, and allocation at a glance. Let’s take a quick tour.',
      },
    },
    {
      element: '[data-tour="nav-watchlist"]',
      popover: {
        title: 'Watchlist',
        description: 'Track stocks and crypto here — and everything you own shows up automatically.',
      },
    },
    {
      element: '[data-tour="nav-insights"]',
      popover: {
        title: 'Insights',
        description: 'Dividend income forecasts, return metrics (IRR/TWR), sector & beta risk, a stress-test simulator, and an AI chat that can look up price history, trades, gains, and dividends to answer questions about your portfolio.',
      },
    },
    {
      element: '[data-tour="nav-news"]',
      popover: {
        title: 'News',
        description: 'Personalized market news from the tickers on your watchlist.',
      },
    },
    {
      element: '[data-tour="nav-account"]',
      popover: {
        title: 'Account',
        description: 'Transaction history, fee profiles, install, and everything else lives here.',
      },
    },
    {
      element: '[data-tour="dash-mover"]',
      popover: {
        title: 'Dashboard tickers are clickable',
        description: 'Click any ticker or mover on the Dashboard to open its position page. On desktop it opens in the side panel; on mobile it opens the full position view. Next, we’ll open this one.',
      },
    },
  ]
}

// Phase 2 — the position detail page/panel opened from a dashboard ticker.
function positionSteps() {
  return [
    {
      element: '[data-tour="pos-header"]',
      popover: {
        title: 'Position page',
        description: 'This is the ticker workspace: quick actions, watchlist status, alerts, and trade logging live at the top.',
      },
    },
    {
      element: '[data-tour="pos-overview"]',
      popover: {
        title: 'Price overview',
        description: 'Current price, today’s move, range change, market session, and extended-hours data are grouped here.',
      },
    },
    {
      element: '[data-tour="pos-chart"]',
      popover: {
        title: 'Interactive chart',
        description: 'Use the chart to inspect price history. Dragging/selecting points can compare movement inside the current range.',
      },
    },
    {
      element: '[data-tour="pos-range"]',
      popover: {
        title: 'Change the range',
        description: 'Click 1D, 5D, 1M, 6M, or 1Y to reload the chart and update the displayed range change.',
      },
    },
    {
      element: '[data-tour="pos-chart-line"]',
      popover: {
        title: 'Line view',
        description: 'The line chart is the fast overview for spotting trend and price direction.',
      },
    },
    {
      element: '[data-tour="pos-chart-candle"]',
      popover: {
        title: 'Candlestick view',
        description: 'Click the candle option when you want open, high, low, and close detail for each bar.',
      },
    },
    {
      element: '[data-tour="pos-add-transaction"]',
      popover: {
        title: 'Log from here',
        description: 'Use the plus button to record a buy, sell, or dividend for this ticker without leaving the position page.',
      },
    },
  ]
}

// Phase 3 — a hands-on look at the Watchlist UI (runs on the /watchlist route).
function watchlistSteps() {
  return [
    {
      element: '[data-tour="wl-actions"], [data-tour="wl-actions-menu"]',
      onHighlightStarted: (el) => {
        // On mobile the actions collapse behind a "⋮" trigger — open it so the
        // popup menu (import, add, etc.) is visible while this step is shown.
        if (el?.matches('[data-tour="wl-actions-menu"]')) {
          el.querySelector('button')?.click()
        }
      },
      popover: {
        title: 'Watchlist actions',
        description: 'Importing, exporting, adding tickers, and logging trades all live here.',
      },
    },
    {
      element: '[data-tour="wl-range"]',
      popover: {
        title: 'Time range',
        description: 'Switch between 1D, 5D, 1M and longer to reshape every row’s chart and change.',
      },
    },
    {
      element: '[data-tour="wl-group"]',
      popover: {
        title: 'Group & sort',
        description: 'Group by Market, Change, Pre/Post, Dividends, Industry, or your own tag Groups. Change-style buttons can be tapped again to flip direction.',
      },
    },
    {
      element: '[data-tour="wl-row"]',
      popover: {
        title: 'A stock row',
        description: 'Each row is a compact data card. Tap anywhere on it to open the full position with charts and buy/sell tools.',
      },
    },
    {
      element: '[data-tour="wl-row-identity"]',
      popover: {
        title: 'Ticker and signals',
        description: 'The ticker is followed by quick signals: active alerts, earnings countdowns, and dividend markers when data is available.',
      },
    },
    {
      element: '[data-tour="wl-row-dividend"]',
      popover: {
        title: 'Dividend marker',
        description: 'This green badge marks dividend-supported tickers. It shows annual yield when available; hover or long-press for the annual dividend detail.',
      },
    },
    {
      element: '[data-tour="wl-row-earnings"]',
      popover: {
        title: 'Earnings badge',
        description: 'This amber badge appears when earnings are due within the next 7 days. Today shows as “Earnings”; future dates show the day count.',
      },
    },
    {
      element: '[data-tour="wl-row-company"]',
      popover: {
        title: 'Company name and tags',
        description: 'The company name sits above your custom tags. Tap the tag row to organize tickers into your own groups.',
      },
    },
    {
      element: '[data-tour="wl-row-chart"]',
      popover: {
        title: 'Sparkline',
        description: 'The mini chart follows the selected watchlist range, with the start and end prices shown underneath.',
      },
    },
    {
      element: '[data-tour="wl-row-price"]',
      popover: {
        title: 'Current price',
        description: 'This is the latest quote in the ticker’s native currency. Israeli tickers use shekels; US stocks and crypto use dollars.',
      },
    },
    {
      element: '[data-tour="wl-row-change"]',
      popover: {
        title: 'Range change',
        description: 'This pill shows the percent move across the selected row range, so changing 1D, 5D, 1M, 6M, or 1Y updates it.',
      },
    },
    {
      element: '[data-tour="wl-add-watchlist"]',
      popover: {
        title: 'Add a stock',
        description: 'Search any ticker or crypto and add it to your watchlist.',
      },
    },
    {
      element: '[data-tour="wl-add-transaction"]',
      popover: {
        title: 'Record a trade',
        description: 'Log a buy, sell, or dividend — it updates your holdings and P&L automatically.',
      },
    },
  ]
}

function markAcknowledged() {
  localStorage.setItem(SEEN_KEY, '1')
}

function finishTour() {
  markAcknowledged()
  tourRunning = false
}

// Wait (briefly) for a selector to appear after a route change, so phase 2 only
// starts once the Watchlist has rendered its anchors.
function waitForElement(selector, timeout = 3000) {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) return resolve(true)
    const started = Date.now()
    const tick = () => {
      if (document.querySelector(selector)) return resolve(true)
      if (Date.now() - started > timeout) return resolve(false)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

// `?tour` (any value) forces the tour open, bypassing the seen-flag gate —
// useful for previewing or replaying. The param is dropped once it starts.
function forcedParam() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('tour')
}

function clearForcedParam() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (url.searchParams.has('tour')) {
    url.searchParams.delete('tour')
    window.history.replaceState(window.history.state, '', url)
  }
}

export function useTour() {
  const router = useRouter()
  const desktopFocus = useDesktopFocusStore()

  // Generic phase runner. Filters out steps whose anchor is missing (mobile vs
  // desktop, empty watchlist). `onDone` fires when the user advances past the
  // final step; `onClose` fires on the × button. Returns null if no anchors.
  function runPhase(steps, {onDone, onClose}) {
    const present = steps.filter((s) => document.querySelector(s.element))
    if (!present.length) return null
    let d
    let handled = false
    const complete = (callback) => {
      if (handled) return
      handled = true
      d.destroy()
      callback?.()
    }
    d = driver({
      showProgress: true,
      allowClose: true,
      overlayColor: 'rgba(0, 0, 0, 0.75)',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Got it',
      popoverClass: 'stockfolio-tour',
      steps: present,
      onCloseClick: () => complete(onClose),
      onDestroyStarted: () => complete(onClose),
      onNextClick: () => {
        // If a step opened a popup (e.g. the watchlist actions dropdown),
        // close it before moving on so it doesn't linger over the next step —
        // PrimeVue's Menu toggles closed on a second click of its own trigger.
        if (document.querySelector('.p-menu')) {
          document.querySelector('[data-tour="wl-actions-menu"] button')?.click()
        }
        if (d.isLastStep()) complete(onDone)
        else d.moveNext()
      },
    })
    d.drive()
    return d
  }

  function isDesktopLayout() {
    return window.matchMedia?.('(min-width: 1024px)').matches
  }

  async function openDashboardTicker() {
    const el = document.querySelector('[data-tour="dash-mover"]')
    const ticker = el?.dataset?.tourTicker
    if (!ticker) return false
    if (isDesktopLayout()) {
      desktopFocus.focus(ticker)
    } else {
      await router.push(`/position/${encodeURIComponent(ticker)}`).catch(() => {})
    }
    const hasHeader = await waitForElement('[data-tour="pos-header"]', 5000)
    if (!hasHeader) return false
    await waitForElement('[data-tour="pos-chart"]', 7000)
    return true
  }

  async function runPositionPhase() {
    const opened = await openDashboardTicker()
    if (!opened) return runWatchlistPhase()
    const started = runPhase(positionSteps(), {
      onDone: runWatchlistPhase,
      onClose: finishTour,
    })
    if (!started) runWatchlistPhase()
  }

  // Final phase: highlight Watchlist UI. Assumes we're already (or now) on /watchlist.
  async function runWatchlistPhase() {
    if (router && router.currentRoute.value.path !== '/watchlist') {
      await router.push('/watchlist').catch(() => {})
    }
    await waitForElement('[data-tour="wl-range"]')
    const started = runPhase(watchlistSteps(), {
      onDone: finishTour,
      onClose: finishTour,
    })
    // Nothing to show (e.g. empty watchlist) → still acknowledge so we don't loop.
    if (!started) finishTour()
  }

  async function startTour() {
    if (tourRunning) return
    tourRunning = true
    if (router && router.currentRoute.value.path !== '/') {
      await router.push('/').catch(() => {})
    }
    // Defer so the current route's DOM (nav, dashboard) is painted first.
    // The seen flag is set only at the end of phase 2 (or on × close), so the
    // tour keeps reappearing until the user acknowledges it.
    requestAnimationFrame(async () => {
      await waitForElement('[data-tour="dash-mover"]', 7000)
      const navStarted = runPhase(navSteps(), {
        onDone: () => { runPositionPhase() },
        onClose: finishTour,
      })
      // No nav anchors (unlikely) → try the watchlist phase directly.
      if (!navStarted) runWatchlistPhase()
      clearForcedParam()
    })
  }

  // Runs once for a user who hasn't seen the tour yet, or whenever `?tour` is set.
  // `blocked` lets the caller suppress the auto-run (e.g. while the What's New
  // modal is open) — but `?tour` always wins.
  function maybeStartTour({blocked = false} = {}) {
    if (forcedParam()) return startTour()
    if (blocked || localStorage.getItem(SEEN_KEY)) return
    startTour()
  }

  function resetTour() {
    localStorage.removeItem(SEEN_KEY)
  }

  return {startTour, maybeStartTour, resetTour}
}
