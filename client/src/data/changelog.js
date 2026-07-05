// What's-new changelog. Newest entry first. Bumping the top `version` (add a
// new entry) is what triggers the WhatsNewModal on the next load.
export const changelog = [
  {
    version: '2026.07.05',
    date: 'Jul 5, 2026',
    title: 'Analytics improvements',
    changes: [
      'Improved usage analytics to help us understand which features matter most',
      'Fixed duplicate price bubble showing while dragging the chart range selector',
      'Realized Gains rows are now tappable to edit or delete the underlying sell/dividend',
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
