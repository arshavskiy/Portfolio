<script setup>
import {useRouter} from 'vue-router'
import Button from 'primevue/button'

const router = useRouter()

const sections = [
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
</script>

<template>
  <div class="math safe-bottom">
    <header class="page-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <h1 class="gradient-title">How the Numbers Work</h1>
    </header>

    <p class="intro text-muted">
      A plain-language look at how StockFolio calculates your average cost, fees, taxes, gains, and portfolio totals.
    </p>

    <section v-for="s in sections" :key="s.title" class="math-card">
      <h2 class="math-title">{{ s.title }}</h2>

      <p v-if="s.intro" class="math-body">{{ s.intro }}</p>

      <div v-if="s.formula" class="math-formula">{{ s.formula }}</div>
      <div v-if="s.formula2" class="math-formula">{{ s.formula2 }}</div>

      <ul v-if="s.points" class="math-list">
        <li v-for="(item, i) in s.points" :key="i">{{ item }}</li>
      </ul>

      <p v-if="s.intro2" class="math-body">{{ s.intro2 }}</p>
    </section>
  </div>
</template>

<style scoped>
.math { padding: 1rem; }
@media (min-width: 768px) { .math { padding: 1.5rem; max-width: 640px; } }

.page-header { display: flex; align-items: center; gap: 0.25rem; margin-bottom: 1rem; }

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
</style>
