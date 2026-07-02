// What's-new changelog. Newest entry first. Bumping the top `version` (add a
// new entry) is what triggers the WhatsNewModal on the next load.
export const changelog = [
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
