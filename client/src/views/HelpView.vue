<script setup>
import {ref, onMounted, nextTick} from 'vue'
import {useRouter} from 'vue-router'
import {useToast} from 'primevue/usetoast'
import QRCode from 'qrcode'
import Button from 'primevue/button'
import {useBreakpoint} from '@/composables/useBreakpoint'

const router = useRouter()
const toast = useToast()
const {isDesktop} = useBreakpoint()

const activeAnchor = ref('about')
const anchors = [
  {id: 'about', label: 'About'},
  {id: 'math', label: 'Math Reference'},
  {id: 'disclaimer', label: 'Financial Disclaimer'},
]

function scrollTo(id) {
  activeAnchor.value = id
  document.getElementById(id)?.scrollIntoView({behavior: 'smooth', block: 'start'})
}

// ── About section ──
const BTC_ADDRESS = 'bc1qdvuarupkqqxkpml6rmpnnnmwns84ll50tgl3v2'
const qrCanvas = ref(null)

const features = [
  { icon: 'pi pi-chart-line', text: 'Live portfolio tracking with P&L, multi-currency totals, and a value-over-time chart' },
  { icon: 'pi pi-globe', text: 'Coverage for US stocks, TASE, global markets, and crypto watchlists' },
  { icon: 'pi pi-money-bill', text: 'Buy/sell lots with fee profiles for broker fees and capital-gains tax simulation' },
  { icon: 'pi pi-bell', text: 'Price alerts via push notifications, set and monitored per ticker' },
  { icon: 'pi pi-bolt', text: 'Dashboard cards for top movers, trending symbols, and live market-hours status' },
  { icon: 'pi pi-clock', text: 'Pre-market and after-hours price changes alongside regular session quotes' },
  { icon: 'pi pi-tags', text: 'Custom multi-tag groups with group-by views across holdings and watchlist' },
  { icon: 'pi pi-upload', text: 'Bulk import holdings or watchlist from Excel, CSV, or Word files' },
]

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(BTC_ADDRESS)
    toast.add({ severity: 'success', summary: 'Address copied', life: 2000 })
  } catch {
    toast.add({ severity: 'warn', summary: 'Copy failed — select it manually', life: 2500 })
  }
}

// ── Math Reference section ──
const mathSections = [
  {
    title: 'Average Cost per Share',
    intro: 'When you buy the same stock multiple times at different prices, StockFolio blends them into one weighted average — the price your gain/loss is measured against.',
    formula: 'Average cost = Total money spent ÷ Total shares owned',
    points: [
      'Buying more shares adds to both the total spent and total shares owned, then recalculates the average.',
      'Selling shares removes a proportional slice of the total cost — the average cost itself doesn’t change on a sell, only your remaining position size.',
      'Reinvested dividends (DRIP) are treated like a small buy at the dividend’s price, so they blend into your average too. Cash dividends you keep don’t affect your average cost.',
    ],
  },
  {
    title: 'Fees',
    intro: 'Every fee profile you set up (like a specific broker) can charge a fee in one of three ways:',
    points: [
      'Percentage — a % of the trade’s total value (e.g. 0.1% of a $10,000 trade = $10)',
      'Per share — a fixed amount for every share traded',
      'Flat — one fixed amount no matter the trade size',
    ],
    formula: 'If the calculated fee is smaller than the profile’s minimum fee, the minimum is charged instead',
  },
  {
    title: 'Capital Gains Tax',
    intro: 'Estimated only on sells that made a profit — never on a loss.',
    formula: 'Tax owed = (Sale price − Average cost) × Shares sold × Tax rate',
    points: [
      'If the sale would result in a loss, no tax is calculated.',
    ],
  },
  {
    title: 'Dividends',
    intro: 'When a stock pays a dividend, you record the amount per share you received — StockFolio does the rest.',
    formula: 'Total dividend = Amount per share × Shares held',
    points: [
      'Cash dividend — the total is added to your Realized Gains as its own gain, and doesn’t change your average cost or share count.',
      'Reinvested dividend (DRIP) — instead of cash, you enter the number of new shares you received. Those shares are added to your position at the dividend’s price, just like a small buy, which shifts your average cost.',
      'Yield estimate shown while logging a dividend = Amount per share ÷ Current price × 4 quarters × 100, a rough annualized rate based on this one payment.',
    ],
  },
  {
    title: 'Realized Gains',
    intro: 'Every time you sell, StockFolio records exactly how much you gained or lost on that specific sale, using your average cost at the moment of the sale.',
    formula: 'Gross gain = Sale proceeds − (Average cost × Shares sold)',
    formula2: 'Net gain = Gross gain − Fees paid − Tax paid',
    points: [
      'Cash dividends count as their own gain, equal to the amount received.',
      'Your Realized Gains page groups all of this by year, with yearly totals for gross gain, net gain, and dividends.',
    ],
  },
  {
    title: 'Portfolio Value & Profit/Loss',
    intro: 'For each position you hold:',
    points: [
      'Current value = Current price × Shares owned',
      'Amount invested = Average cost × Shares owned',
      'Profit/Loss = Current value − Amount invested',
      'Profit/Loss % = Profit/Loss ÷ Amount invested × 100',
      'Today’s change = Today’s price movement × Shares owned',
    ],
    intro2: 'Your dashboard totals add every position together the same way, and today’s % change compares against yesterday’s total value.',
  },
  {
    title: 'Currency Conversion (USD ⇄ ILS)',
    intro: 'Positions and fees can be priced in US Dollars or Israeli Shekels — StockFolio converts between them automatically wherever totals are combined.',
    points: [
      'The exchange rate is pulled live from the market and refreshed roughly once an hour.',
      'A fee set in one currency is converted into the transaction’s own currency before it’s added to your totals.',
      'Israeli stock prices are quoted in Agorot (1/100th of a Shekel) and are automatically scaled to whole Shekels for display.',
    ],
  },
  {
    title: 'Rebalancer',
    intro: 'You set a target percentage of your total portfolio for each stock. StockFolio compares that target against what you currently hold and suggests a buy or sell.',
    formula: 'Target value = Total portfolio value × Target %',
    formula2: 'Amount to buy/sell = Target value − Current value of that position',
    points: [
      'A positive difference means "buy more," a negative difference means "sell some." Very small differences are treated as "hold — already balanced."',
      'Suggestions are ranked with the biggest imbalances shown first.',
      '"Equal weight" splits 100% evenly across every position you hold in one tap.',
    ],
  },
]

onMounted(async () => {
  if (!isDesktop.value) return
  await nextTick()
  if (!qrCanvas.value) return
  try {
    await QRCode.toCanvas(qrCanvas.value, `bitcoin:${BTC_ADDRESS}`, {
      width: 160, margin: 1, color: { dark: '#000000', light: '#ffffff' },
    })
  } catch {}
})
</script>

<template>
  <!-- ── Mobile: hub menu list ── -->
  <div v-if="!isDesktop" class="help safe-bottom">
    <header class="page-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <h1 class="gradient-title">About</h1>
    </header>

    <div class="menu-list">
      <button class="menu-item" @click="router.push('/about')">
        <i class="pi pi-info-circle menu-icon"/>
        <span>About</span>
        <i class="pi pi-chevron-right text-muted" />
      </button>
      <button class="menu-item" @click="router.push('/math')">
        <i class="pi pi-calculator menu-icon"/>
        <span>Math Reference</span>
        <i class="pi pi-chevron-right text-muted" />
      </button>
      <button class="menu-item" @click="router.push('/disclaimer')">
        <i class="pi pi-shield menu-icon"/>
        <span>Financial Disclaimer</span>
        <i class="pi pi-chevron-right text-muted" />
      </button>
    </div>
  </div>

  <!-- ── Desktop: combined single-scroll page with anchor tabs ── -->
  <div v-else class="help-desktop safe-bottom">
    <header class="page-header">
      <h1 class="gradient-title">About</h1>
    </header>

    <nav class="anchor-tabs">
      <button
          v-for="a in anchors"
          :key="a.id"
          :class="{active: activeAnchor === a.id}"
          class="anchor-tab"
          @click="scrollTo(a.id)"
      >{{ a.label }}</button>
    </nav>

    <div class="help-body">
      <!-- About -->
      <section id="about" class="anchor-section">
        <h2 class="section-title">About</h2>

        <div class="screenshot-card">
          <div class="screenshot-label">Desktop View</div>
          <img src="/screenshot-desktop.png" alt="StockFolio desktop dashboard" class="screenshot-img" />
        </div>

        <div class="screenshot-card">
          <div class="screenshot-label">Import from Excel / CSV</div>
          <img src="/import-guide.svg" alt="How to import holdings from Excel or CSV" class="screenshot-img" />
        </div>

        <div class="intro-card">
          <div class="brand">
            <span class="brand-mark">📈</span>
            <span class="brand-name gradient-title">StockFolio</span>
          </div>
          <p class="tagline text-muted">
            A fast, mobile-first tracker for stocks, crypto, and global markets — with live P&L,
            price alerts, and a clean dark interface.
          </p>
          <ul class="feature-list">
            <li v-for="f in features" :key="f.text">
              <i :class="f.icon" /><span>{{ f.text }}</span>
            </li>
          </ul>
        </div>

        <div class="donate-card">
          <h3 class="donate-title">Support StockFolio</h3>
          <p class="text-muted donate-sub">
            StockFolio is free. If it's useful to you, a Bitcoin tip helps keep it running.
          </p>
          <div class="qr-wrap">
            <canvas ref="qrCanvas" class="qr" />
          </div>
          <div class="addr-label text-muted">Your Bitcoin Address</div>
          <div class="addr-row">
            <code class="addr">{{ BTC_ADDRESS }}</code>
            <button class="copy-btn" title="Copy" @click="copyAddress">
              <i class="pi pi-copy" />
            </button>
          </div>
          <div class="contact-block">
            <div class="text-muted contact-label">Contact</div>
            <a class="contact-link" href="mailto:pavelspersonalhelper@gmail.com">Email me</a>
            <a class="contact-link" href="https://t.me/PashaArsha" rel="noopener noreferrer" target="_blank">Telegram me</a>
          </div>
        </div>
      </section>

      <!-- Math Reference -->
      <section id="math" class="anchor-section">
        <h2 class="section-title">Math Reference</h2>
        <p class="intro text-muted">
          A plain-language look at how StockFolio calculates your average cost, fees, taxes, gains, and portfolio totals.
        </p>

        <section v-for="s in mathSections" :key="s.title" class="math-card">
          <h3 class="math-title">{{ s.title }}</h3>
          <p v-if="s.intro" class="math-body">{{ s.intro }}</p>
          <div v-if="s.formula" class="math-formula">{{ s.formula }}</div>
          <div v-if="s.formula2" class="math-formula">{{ s.formula2 }}</div>
          <ul v-if="s.points" class="math-list">
            <li v-for="(item, i) in s.points" :key="i">{{ item }}</li>
          </ul>
          <p v-if="s.intro2" class="math-body">{{ s.intro2 }}</p>
        </section>
      </section>

      <!-- Financial Disclaimer -->
      <section id="disclaimer" class="anchor-section">
        <h2 class="section-title">Financial Disclaimer</h2>
        <p class="eyebrow">Important information</p>
        <p class="disclaimer-intro">
          StockFolio helps you organize market data, holdings, watchlists, alerts, and portfolio calculations. It is a tracking and research tool only.
        </p>

        <section class="notice">
          <i class="pi pi-exclamation-triangle"/>
          <div>
            <h3>Not financial advice</h3>
            <p>
              StockFolio does not provide investment, financial, tax, legal, or accounting advice. Nothing in the app is a recommendation to buy, sell, hold, or trade any security, crypto asset, or other financial instrument.
            </p>
          </div>
        </section>

        <section class="disclaimer-grid">
          <article class="disclaimer-card">
            <h3>Investment risk</h3>
            <p>
              Investing involves risk, including possible loss of principal. Prices can move quickly, past performance does not guarantee future results, and simulated results or projections may not reflect actual outcomes.
            </p>
          </article>

          <article class="disclaimer-card">
            <h3>Market data</h3>
            <p>
              Quotes, charts, news, alerts, dividends, currency conversions, and other data may be delayed, incomplete, inaccurate, or unavailable. Always verify important information with your broker, exchange, issuer, or another official source before making decisions.
            </p>
          </article>

          <article class="disclaimer-card">
            <h3>User responsibility</h3>
            <p>
              You are responsible for your own investment decisions and for reviewing the accuracy of imported transactions, fees, tax assumptions, holdings, watchlists, and calculations. Consult a qualified professional for advice based on your personal situation.
            </p>
          </article>

          <article class="disclaimer-card">
            <h3>No guarantees</h3>
            <p>
              StockFolio is provided without warranties about availability, accuracy, completeness, or fitness for a particular purpose. The app and its creator are not liable for losses or damages arising from your use of the app or reliance on its content.
            </p>
          </article>
        </section>

        <p class="closing text-muted">
          By using StockFolio, you acknowledge that you understand these limitations and agree to use the app as an informational portfolio tool.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* ── Mobile hub ── */
.help { padding: 1rem; }

.page-header { display: flex; align-items: center; gap: 0.25rem; margin-bottom: 1.25rem; }

.menu-list {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.9rem 1rem;
  border: none;
  border-bottom: 1px solid var(--border);
  background: none;
  color: var(--text-primary);
  font-size: 0.92rem;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}
.menu-item:last-child { border-bottom: none; }
.menu-item:active { background: rgba(255, 255, 255, 0.04); }
.menu-item span { flex: 1; }

.menu-icon { color: var(--accent); font-size: 1rem; }

/* ── Desktop combined page ── */
.help-desktop {
  padding: 2.5rem 3rem;
  height: 100%;
  overflow-y: auto;
}

.anchor-tabs {
  display: flex;
  gap: 0.5rem;
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--bg-primary);
  padding: 0.5rem 0 1rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.anchor-tab {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.anchor-tab:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.anchor-tab.active {
  background: rgba(0, 207, 255, 0.12);
  border-color: var(--neon-blue);
  color: var(--neon-blue);
}

.help-body {
  max-width: 900px;
  margin: 0 auto;
}

.anchor-section {
  scroll-margin-top: 90px;
  margin-bottom: 3rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--border);
}
.anchor-section:last-child { border-bottom: none; }

.section-title {
  font-size: 1.4rem;
  font-weight: 800;
  margin-bottom: 1.25rem;
}

/* About content */
.screenshot-card {
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 1rem;
}

.screenshot-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.6rem 1rem;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
}

.screenshot-img {
  display: block;
  width: 100%;
  height: auto;
  background: #070707;
}

.intro-card, .donate-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.25rem;
  margin-bottom: 1rem;
}

.brand { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.75rem; }
.brand-mark { font-size: 1.5rem; }
.brand-name { font-size: 1.3rem; font-weight: 800; }
.tagline { font-size: 0.88rem; line-height: 1.5; margin-bottom: 1rem; }

.feature-list { list-style: none; display: flex; flex-direction: column; gap: 0.6rem; }
.feature-list li { display: flex; align-items: flex-start; gap: 0.6rem; font-size: 0.85rem; }
.feature-list i { color: var(--accent); font-size: 0.85rem; margin-top: 2px; }

.donate-card { text-align: center; }
.donate-title { font-size: 1.05rem; font-weight: 700; margin-bottom: 0.35rem; }
.donate-sub { font-size: 0.82rem; line-height: 1.45; margin-bottom: 1.1rem; }

.qr-wrap { display: inline-flex; padding: 12px; background: #fff; border-radius: 16px; }
.qr { display: block; width: 160px; height: 160px; }
.addr-label { font-size: 0.78rem; margin: 0.75rem 0 0.4rem; }

.addr-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
}
.addr {
  flex: 1;
  font-family: monospace;
  font-size: 0.74rem;
  word-break: break-all;
  text-align: left;
  color: var(--text-primary);
}
.copy-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 6px;
  flex-shrink: 0;
}
.copy-btn:active { color: var(--accent); }

.contact-block {
  margin-top: 1rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.contact-label { font-size: 0.78rem; margin-bottom: 0.25rem; }
.contact-link {
  color: var(--accent);
  font-size: 0.86rem;
  word-break: break-all;
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

/* Math content */
.intro { font-size: 0.88rem; line-height: 1.5; margin-bottom: 1rem; }

.math-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.1rem 1.25rem;
  margin-bottom: 1rem;
}

.math-title { font-size: 1.02rem; font-weight: 700; margin-bottom: 0.6rem; }
.math-body { font-size: 0.85rem; line-height: 1.55; margin-bottom: 0.65rem; }

.math-formula {
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1.5;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 10px;
  padding: 0.7rem 0.9rem;
  margin-bottom: 0.65rem;
  color: var(--text-primary);
}

.math-list {
  list-style: disc;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: 0.83rem;
  line-height: 1.5;
}

/* Disclaimer content */
.eyebrow {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin-bottom: 0.35rem;
  text-transform: uppercase;
}

.disclaimer-intro {
  color: var(--text-secondary);
  font-size: 0.98rem;
  line-height: 1.55;
  max-width: 760px;
  margin-bottom: 1rem;
}

.notice {
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.32);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.notice i {
  color: #f59e0b;
  font-size: 1.1rem;
  margin-top: 0.15rem;
}

.notice h3,
.disclaimer-card h3 {
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 800;
  margin-bottom: 0.4rem;
}

.notice p,
.disclaimer-card p {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.55;
}

.disclaimer-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.disclaimer-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
}

.closing {
  font-size: 0.82rem;
  line-height: 1.5;
  margin: 1rem 0 0;
}
</style>
