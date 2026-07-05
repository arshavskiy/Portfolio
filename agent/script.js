const fallbackCommunities = [
  {
    id: 'facebook-israeli-investors',
    platform: 'facebook',
    name: 'Israeli Investors',
    language: 'he',
    members: 32000,
    activity: 92,
    relevance: 95,
    posting: 'Check rules',
    url: 'https://www.facebook.com/search/groups/?q=Israeli%20investors%20stocks',
    notes: 'Strong fit for Hebrew-speaking investors. Check group rules and use a feedback-first post.',
  },
  {
    id: 'facebook-stock-market-israel',
    platform: 'facebook',
    name: 'Stock Market Israel',
    language: 'he',
    members: 21000,
    activity: 86,
    relevance: 90,
    posting: 'Check rules',
    url: 'https://www.facebook.com/search/groups/?q=stock%20market%20israel',
    notes: 'Relevant audience for stocks and portfolio tracking. Avoid repeated identical posts.',
  },
  {
    id: 'facebook-crypto-israel',
    platform: 'facebook',
    name: 'Crypto Israel',
    language: 'he',
    members: 28000,
    activity: 88,
    relevance: 84,
    posting: 'Check rules',
    url: 'https://www.facebook.com/search/groups/?q=crypto%20israel',
    notes: 'Use the crypto tracking and watchlist angle. Do not frame it as investment advice.',
  },
  {
    id: 'reddit-stocks',
    platform: 'reddit',
    name: 'r/stocks',
    language: 'en',
    members: 7600000,
    activity: 98,
    relevance: 87,
    posting: 'Restricted',
    url: 'https://www.reddit.com/r/stocks/',
    notes: 'Large and relevant, but self-promotion is often restricted. Ask moderators or use allowed feedback threads.',
  },
  {
    id: 'reddit-investing',
    platform: 'reddit',
    name: 'r/investing',
    language: 'en',
    members: 2900000,
    activity: 95,
    relevance: 86,
    posting: 'Restricted',
    url: 'https://www.reddit.com/r/investing/',
    notes: 'Strict rules. Treat this as research or moderator outreach before posting any product link.',
  },
  {
    id: 'reddit-valueinvesting',
    platform: 'reddit',
    name: 'r/valueinvesting',
    language: 'en',
    members: 320000,
    activity: 74,
    relevance: 68,
    posting: 'Restricted',
    url: 'https://www.reddit.com/r/valueinvesting/',
    notes: 'Only relevant if the message focuses on portfolio process and long-term tracking.',
  },
  {
    id: 'telegram-crypto-israel',
    platform: 'telegram',
    name: 'Crypto Israel Telegram discovery',
    language: 'he',
    members: 12000,
    activity: 78,
    relevance: 80,
    posting: 'Ask admins',
    url: 'https://www.google.com/search?q=site%3At.me+crypto+israel',
    notes: 'Use this as a discovery search. Ask admins before posting in public channels or groups.',
  },
  {
    id: 'discord-investing',
    platform: 'discord',
    name: 'Investing Discord discovery',
    language: 'en',
    members: 50000,
    activity: 76,
    relevance: 72,
    posting: 'Ask admins',
    url: 'https://disboard.org/search?keyword=investing',
    notes: 'Discord servers often require intros, role approval, or admin permission before links.',
  },
  {
    id: 'x-investing',
    platform: 'x',
    name: 'X investing conversations',
    language: 'en',
    members: 250000,
    activity: 89,
    relevance: 70,
    posting: 'Usually allowed',
    url: 'https://x.com/search?q=stock%20portfolio%20tracker&src=typed_query',
    notes: 'Best used for relevant replies and founder updates. Avoid duplicate mass posting.',
  },
  {
    id: 'forum-investing-com',
    platform: 'forum',
    name: 'Investing.com forums',
    language: 'en',
    members: 1000000,
    activity: 83,
    relevance: 74,
    posting: 'Check rules',
    url: 'https://www.investing.com/',
    notes: 'Large market audience. Find a relevant discussion thread instead of posting broadly.',
  },
  {
    id: 'forum-themarker',
    platform: 'forum',
    name: 'TheMarker community discovery',
    language: 'he',
    members: 80000,
    activity: 70,
    relevance: 76,
    posting: 'Check rules',
    url: 'https://www.google.com/search?q=site%3Athemarker.com+%D7%94%D7%A9%D7%A7%D7%A2%D7%95%D7%AA+%D7%A4%D7%95%D7%A8%D7%95%D7%9D',
    notes: 'Use as a discovery entry point for Hebrew investing discussions.',
  },
]

const platformLabels = {
  facebook: 'Facebook',
  reddit: 'Reddit',
  telegram: 'Telegram',
  discord: 'Discord',
  x: 'X',
  forum: 'Forum',
}

const discoverySearches = [
  ['Facebook investing groups', 'https://www.facebook.com/search/groups/?q=investing%20stocks%20portfolio'],
  ['Facebook crypto groups', 'https://www.facebook.com/search/groups/?q=crypto%20investing'],
  ['Reddit portfolio tracker', 'https://www.reddit.com/search/?q=portfolio%20tracker'],
  ['Telegram crypto groups', 'https://www.google.com/search?q=site%3At.me+crypto+investing'],
  ['Discord investing servers', 'https://disboard.org/search?keyword=investing'],
  ['X portfolio tracker search', 'https://x.com/search?q=portfolio%20tracker%20stocks&src=typed_query'],
  ['Investing forums', 'https://www.google.com/search?q=investing+forum+portfolio+tracker'],
]

const state = {
  selectedId: fallbackCommunities[0].id,
  serverMode: false,
  discoveryRunning: false,
}

let communities = [...fallbackCommunities]

const els = {
  platformFilter: document.querySelector('#platformFilter'),
  languageFilter: document.querySelector('#languageFilter'),
  angleSelect: document.querySelector('#angleSelect'),
  hideRestricted: document.querySelector('#hideRestricted'),
  targetList: document.querySelector('#targetList'),
  targetCount: document.querySelector('#targetCount'),
  targetName: document.querySelector('#targetName'),
  scoreBadge: document.querySelector('#scoreBadge'),
  membersMetric: document.querySelector('#membersMetric'),
  activityMetric: document.querySelector('#activityMetric'),
  relevanceMetric: document.querySelector('#relevanceMetric'),
  policyMetric: document.querySelector('#policyMetric'),
  targetNotes: document.querySelector('#targetNotes'),
  basePost: document.querySelector('#basePost'),
  postPreview: document.querySelector('#postPreview'),
  copyBtn: document.querySelector('#copyBtn'),
  copyOpenBtn: document.querySelector('#copyOpenBtn'),
  discoverBtn: document.querySelector('#discoverBtn'),
  openBtn: document.querySelector('#openBtn'),
  searchLinks: document.querySelector('#searchLinks'),
  agentStatus: document.querySelector('#agentStatus'),
  toast: document.querySelector('#toast'),
}

function scoreCommunity(community) {
  const policyScore = community.posting === 'Usually allowed' ? 100 : community.posting === 'Restricted' ? 35 : 70
  const memberScore = Math.min(100, Math.round(Math.log10(Math.max(community.members, 10)) * 18))
  return Math.round((community.relevance * 0.42) + (community.activity * 0.26) + (memberScore * 0.18) + (policyScore * 0.14))
}

function getFilteredCommunities() {
  return communities
    .filter((community) => els.platformFilter.value === 'all' || community.platform === els.platformFilter.value)
    .filter((community) => els.languageFilter.value === 'all' || community.language === els.languageFilter.value)
    .filter((community) => !els.hideRestricted.checked || community.posting !== 'Restricted')
    .map((community) => ({...community, score: scoreCommunity(community)}))
    .sort((a, b) => b.score - a.score)
}

function getActiveCommunity() {
  const filtered = getFilteredCommunities()
  return filtered.find((community) => community.id === state.selectedId) || filtered[0]
}

function createPost(community) {
  if (!community) return ''

  const audience = community.language === 'he'
    ? 'היי, בניתי את StockFolio ואשמח לפידבק מאנשים שמנהלים תיק השקעות או עוקבים אחרי מניות וקריפטו.\n' +
      'פיתחתי אתר חדש שמאפשר לנהל ולעקוב אחרי תיקי השקעות במקום אחד, עם דגש על ממשק מהיר ונוח.\n' +
      'האתר עדיין בפיתוח, ולכן כל פידבק יתקבל בברכה!\n' +
      'https://stockfolio.handcoded.tech\n' +
      'אשמח לשמוע מה דעתכם ומה הייתם רוצים לראות בהמשך.'
    : `Hi ${community.name}, I am looking for feedback from people who actively track their investments.`

  const angle = {
    feedback: community.language === 'he'
      ? 'מה שהכי יעזור לי הוא פידבק פרקטי: מה שימושי, מה חסר, ומה היה גורם לכם להשתמש בזה באופן קבוע.'
      : 'The main thing I need is practical feedback: what feels useful, what is missing, and what would make it worth using regularly.',
    portfolio: community.language === 'he'
      ? 'הכלי בנוי סביב ניהול תיק בפועל: אחזקות, פעולות, רווח/הפסד, רשימות מעקב, חדשות והתראות במקום אחד.'
      : 'The workflow is built around real portfolio tracking: holdings, transactions, P&L, watchlists, news, and alerts in one place.',
    crypto: community.language === 'he'
      ? 'זווית הקריפטו פשוטה: לעקוב אחרי קריפטו לצד מניות ו-ETF בלי להפוך את הכלי לבורסה או לבוט מסחר.'
      : 'The crypto angle is simple: keep crypto watchlists next to stocks and ETFs without turning the app into an exchange or trading bot.',
    alerts: community.language === 'he'
      ? 'זווית ההתראות פרקטית: להגדיר התראות מחיר ולראות בצורה נקייה מה דורש תשומת לב בתיק.'
      : 'The alerts angle is practical: set price alerts and keep a cleaner view of what needs attention across the portfolio.',
  }[els.angleSelect.value]

  const policyLine = community.posting === 'Restricted'
    ? community.language === 'he'
      ? 'אפרסם את זה רק אם חוקי הקהילה מאפשרים פוסטים לקבלת פידבק על מוצר, או אחרי אישור מנהלים.'
      : 'I will only post this where community rules allow product feedback posts or after moderator approval.'
    : community.language === 'he'
      ? 'אני בודק את חוקי הקהילה ומפרסם ידנית רק אם זה רלוונטי ומותר.'
      : 'I checked that this is relevant to the community and will publish manually after reviewing the rules.'

  return `${audience}

${els.basePost.value.trim()}

${angle}

${policyLine}`
}

function formatMembers(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`
  if (value >= 1000) return `${Math.round(value / 1000)}K`
  return String(value)
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function loadCommunities() {
  try {
    const response = await fetch('/api/communities')
    if (!response.ok) throw new Error(`Server returned ${response.status}`)
    const payload = await response.json()
    communities = Array.isArray(payload.communities) && payload.communities.length
      ? payload.communities
      : [...fallbackCommunities]
    state.serverMode = true
    setStatus(`Server mode. Loaded ${communities.length} stored targets.`)
  } catch {
    communities = [...fallbackCommunities]
    state.serverMode = false
    setStatus('Local mode. Start the server with npm start to enable saved targets and discovery.')
  }

  if (!communities.some((community) => community.id === state.selectedId)) {
    state.selectedId = communities[0]?.id
  }

  render()
}

async function runDiscovery() {
  if (state.discoveryRunning) return

  state.discoveryRunning = true
  els.discoverBtn.disabled = true
  els.discoverBtn.textContent = 'Discovering...'
  setStatus('Discovery is running. This searches public results and may take a moment.')

  try {
    const response = await fetch('/api/discover', {method: 'POST'})
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || `Server returned ${response.status}`)

    communities = payload.communities || communities
    state.serverMode = true
    setStatus(`Discovery complete. Scanned ${payload.scanned}, added ${payload.added}, updated ${payload.updated}.`)
    if (payload.errors?.length) {
      showToast(`Discovery finished with ${payload.errors.length} search warnings`)
    } else {
      showToast('Discovery complete')
    }
    render()
  } catch (error) {
    setStatus(`Discovery failed: ${error.message}. Make sure the local server is running and network access is available.`)
    showToast('Discovery failed')
  } finally {
    state.discoveryRunning = false
    els.discoverBtn.disabled = false
    els.discoverBtn.textContent = 'Run discovery'
  }
}

function setStatus(message) {
  els.agentStatus.textContent = message
}

function renderTargets() {
  const filtered = getFilteredCommunities()
  els.targetCount.textContent = filtered.length
  els.targetList.innerHTML = ''

  filtered.forEach((community) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `target ${community.id === state.selectedId ? 'active' : ''}`
    button.innerHTML = `
      <span>
        <strong>${escapeHtml(community.name)}</strong>
        <small>${escapeHtml(platformLabels[community.platform] || community.platform)} | ${formatMembers(community.members || 0)} members | ${escapeHtml((community.language || 'en').toUpperCase())}</small>
      </span>
      <em>${community.score}</em>
    `
    button.addEventListener('click', () => {
      state.selectedId = community.id
      render()
    })
    els.targetList.appendChild(button)
  })
}

function renderDetail() {
  const community = getActiveCommunity()

  if (!community) {
    els.targetName.textContent = 'No matching targets'
    els.scoreBadge.textContent = '0'
    els.membersMetric.textContent = '0'
    els.activityMetric.textContent = '0'
    els.relevanceMetric.textContent = '0'
    els.policyMetric.textContent = '-'
    els.targetNotes.textContent = 'Change the filters to show more communities.'
    els.postPreview.textContent = ''
    return
  }

  state.selectedId = community.id
  const score = scoreCommunity(community)
  els.targetName.textContent = community.name
  els.scoreBadge.textContent = score
  els.membersMetric.textContent = formatMembers(community.members || 0)
  els.activityMetric.textContent = community.activity || 0
  els.relevanceMetric.textContent = community.relevance || 0
  els.policyMetric.textContent = community.posting || 'Check rules'
  els.targetNotes.textContent = community.notes
  els.postPreview.textContent = createPost(community)
}

function renderSearchLinks() {
  els.searchLinks.innerHTML = ''
  discoverySearches.forEach(([label, url]) => {
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = label
    els.searchLinks.appendChild(link)
  })
}

function render() {
  renderTargets()
  renderDetail()
}

function showToast(message) {
  els.toast.textContent = message
  els.toast.classList.add('visible')
  window.setTimeout(() => els.toast.classList.remove('visible'), 1800)
}

async function copyPost() {
  const text = els.postPreview.textContent.trim()
  if (!text) return

  try {
    await navigator.clipboard.writeText(text)
    showToast('Post copied')
  } catch {
    showToast('Copy failed. Select the text manually.')
  }
}

function openTarget() {
  const community = getActiveCommunity()
  if (!community) return
  window.open(community.url, '_blank', 'noopener,noreferrer')
}

async function copyAndOpen() {
  await copyPost()
  openTarget()
}

for (const input of [els.platformFilter, els.languageFilter, els.angleSelect, els.hideRestricted, els.basePost]) {
  input.addEventListener('input', render)
  input.addEventListener('change', render)
}

els.copyBtn.addEventListener('click', copyPost)
els.copyOpenBtn.addEventListener('click', copyAndOpen)
els.discoverBtn.addEventListener('click', runDiscovery)
els.openBtn.addEventListener('click', openTarget)

renderSearchLinks()
loadCommunities()
