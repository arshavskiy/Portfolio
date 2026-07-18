import {driver} from 'driver.js'
import 'driver.js/dist/driver.css'
import '@/assets/tour.css'

const SEEN_KEYS = {
  nav: 'stockfolio-tour-seen-nav',
  position: 'stockfolio-tour-seen-position',
  watchlist: 'stockfolio-tour-seen-watchlist',
}
const runningPhases = new Set()

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
        description: 'Click any ticker or mover on the Dashboard to open its position page. On desktop it opens in the side panel; on mobile it opens the full position view.',
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

function markSeen(phase) {
  localStorage.setItem(SEEN_KEYS[phase], '1')
}

function finishPhase(phase) {
  markSeen(phase)
  runningPhases.delete(phase)
}

// Wait (briefly) for a selector to appear after mount, so a phase only starts
// once its page has actually rendered the anchors.
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

// Each phase runs independently, triggered when the user actually lands on
// the page that phase covers — no forced navigation between pages. Only one
// driver.js instance can be on screen at a time (e.g. on desktop, Dashboard
// and Watchlist share one screen so both phases can become eligible in the
// same tick), so a phase waits its turn instead of stomping another.
function runPhaseOnce(phase, steps, {retryDelay = 400} = {}) {
  if (runningPhases.has(phase)) return
  if (runningPhases.size > 0) {
    setTimeout(() => runPhaseOnce(phase, steps, {retryDelay}), retryDelay)
    return
  }
  runningPhases.add(phase)
  const started = runPhase(steps, {
    onDone: () => finishPhase(phase),
    onClose: () => finishPhase(phase),
  })
  // Nothing to show (anchors missing) → still mark seen so it doesn't retry every visit.
  if (!started) finishPhase(phase)
}

export function useTour() {
  async function startNavPhase() {
    await waitForElement('[data-tour="nav-dashboard"]', 7000)
    runPhaseOnce('nav', navSteps())
  }

  async function startPositionPhase() {
    await waitForElement('[data-tour="pos-header"]', 5000)
    await waitForElement('[data-tour="pos-chart"]', 7000)
    runPhaseOnce('position', positionSteps())
  }

  async function startWatchlistPhase() {
    await waitForElement('[data-tour="wl-range"]', 5000)
    runPhaseOnce('watchlist', watchlistSteps())
  }

  // `?tour` (any value) forces every phase eligible on the current page to
  // replay, bypassing the seen-flag gate — useful for previewing. `blocked`
  // lets the caller suppress the auto-run (e.g. while What's New is open),
  // but `?tour` always wins.
  function maybeStartNavPhase({blocked = false} = {}) {
    if (forcedParam()) { clearForcedParam(); localStorage.removeItem(SEEN_KEYS.nav); return startNavPhase() }
    if (blocked || localStorage.getItem(SEEN_KEYS.nav)) return
    startNavPhase()
  }

  function maybeStartPositionPhase() {
    if (forcedParam()) { clearForcedParam(); localStorage.removeItem(SEEN_KEYS.position); return startPositionPhase() }
    if (localStorage.getItem(SEEN_KEYS.position)) return
    startPositionPhase()
  }

  function maybeStartWatchlistPhase() {
    if (forcedParam()) { clearForcedParam(); localStorage.removeItem(SEEN_KEYS.watchlist); return startWatchlistPhase() }
    if (localStorage.getItem(SEEN_KEYS.watchlist)) return
    startWatchlistPhase()
  }

  function resetTour() {
    localStorage.removeItem(SEEN_KEYS.nav)
    localStorage.removeItem(SEEN_KEYS.position)
    localStorage.removeItem(SEEN_KEYS.watchlist)
  }

  return {
    startNavPhase,
    startPositionPhase,
    startWatchlistPhase,
    maybeStartNavPhase,
    maybeStartPositionPhase,
    maybeStartWatchlistPhase,
    resetTour,
  }
}
