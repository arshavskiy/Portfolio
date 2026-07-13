// What's-new changelog. Newest entry first. Bumping the top `version` (add a
// new entry) is what triggers the WhatsNewModal on the next load.
export const changelog = [
  {
    version: '2026.07.13',
    date: 'Jul 13, 2026',
    title: 'Dividend watchlist and guided demo',
    changes: [
      'Watchlist rows now show dividend yield markers when quote data includes dividend support',
      'New Dividends grouping separates dividend payers from rows without dividend data',
      'The guided tour now walks through watchlist row data: ticker signals, dividend and earnings badges, sparkline, price, and range change',
      'Brand-new accounts start with demo watchlist and holding data so the first walkthrough can show real app features immediately',
    ],
  },
  {
    version: '2026.07.11',
    date: 'Jul 11, 2026',
    title: 'Updates',
    changes: [
      "Dividend calendar on the dashboard with ex-dividend push reminders, and price-target progress bars on the position page",
      "Earnings-week badges on the watchlist, S&P 500 / TA-125 benchmark overlay on the compare chart, Russian-language news feed, a position journal for your investment thesis, and allocation drift push alerts from saved rebalance targets",
    ],
  },
  {
    version: '2026.07.06',
    date: 'Jul 6, 2026',
    title: 'Watchlist fixes',
    changes: [
      'No-trade rows in the Watchlist show the colored gain/loss pill again, alongside the "No trade" tag',
      'Added a new "How the Numbers Work" math reference page explaining fees, gains, and portfolio math in plain language',
      'Replaced the desktop screenshot on the About page',
      'Grouped About, Math Reference, and Financial Disclaimer under a single "About" entry',
      'Added back buttons to the Alerts and Financial Disclaimer pages',
      'Moved About to the main navigation bar instead of inside Account',
      'Removed the duplicate donate/support card from Account — it now only lives on the About page',
      'Fixed the About/Math/Disclaimer pages missing the navigation bar on mobile',
      'Desktop About page now shows a two-column layout with a sticky Support card',
      'On desktop, About/Math Reference/Financial Disclaimer combine into one scrollable page with quick-jump tabs',
    ],
  },
  {
    version: '2026.07.05',
    date: 'Jul 5, 2026',
    title: 'Analytics improvements',
    changes: [
      'Improved usage analytics to help us understand which features matter most',
      'Fixed duplicate price bubble showing while dragging the chart range selector',
      'Realized Gains rows are now tappable to edit or delete the underlying sell/dividend',
      'Fixed crypto ticker search not finding results while typing',
      'Added Sign in with Google as an alternative to email/password',
      'Fixed Realized Gains list not refreshing after editing or deleting a row',
      'Redesigned desktop Account page with a proper two-column layout',
      'Removed the "CSV" label from download buttons in History and Realized Gains tabs',
      'Watchlist group-by icons now turn green or red to match gainers/losers-first direction',
      'Added tap-to-explain tooltips on the Watchlist group-by buttons',
      'Dashboard loading spinner now matches the style used elsewhere in the app',
    ],
  },
  {
    version: '2026.07.04',
    date: 'Jul 4, 2026',
    title: 'Holdings always in view, snappier watchlist Guided tour and chart range help',
    changes: [
      'New guided tour walks through Dashboard, clickable Top Movers, Position details, and Watchlist tools',
      'Account now has a Start Tour option for replaying the walkthrough anytime',
      'Position charts now explain how to click two points to measure a custom range',
      'Chart range help can be dismissed permanently with the X button',
      'Desktop position panels now include the same chart range measuring tools',
      'Dragging chart range markers now keeps the vertical dotted guide in sync',
      'Stocks you own now always show on the Watchlist — even if you never added them',
      'Watchlist rows appear with your last-seen prices and charts instantly, then refresh',
      'Cleaner closed-market rows — no stale pre/post numbers, shorter "No trade" tag',
      'Renamed Profile to Account',
      'Fixed notification pop-ups spilling past the edge on phones',
      'More compact chart measure readout',
    ],
  },
  {
    version: '2026.07.02',
    date: 'Jul 2, 2026',
    title: 'Watchlist is now home base',
    changes: [
      'Merged the Holdings page into Watchlist — manage everything in one place',
      'New Holdings filter: tap the gold briefcase to show only stocks you own',
      'Add transactions and import holdings straight from the Watchlist header',
      'Faster first load — your watchlist appears instantly while quotes stream in',
      'Portfolio totals moved to the Dashboard, with a one-tap ₪/$ currency toggle',
      "This 'What's New' note — you're reading it now",
    ],
  },
]

export const currentVersion = changelog[0]?.version ?? null
