<template>
  <div class="disclaimer safe-bottom">
    <header class="page-header">
      <p class="eyebrow">Important information</p>
      <h1 class="gradient-title">Financial Disclaimer</h1>
      <p class="intro">
        StockFolio helps you organize market data, holdings, watchlists, alerts, and portfolio calculations. It is a tracking and research tool only.
      </p>
    </header>

    <section class="notice">
      <i class="pi pi-exclamation-triangle"/>
      <div>
        <h2>Not financial advice</h2>
        <p>
          StockFolio does not provide investment, financial, tax, legal, or accounting advice. Nothing in the app is a recommendation to buy, sell, hold, or trade any security, crypto asset, or other financial instrument.
        </p>
      </div>
    </section>

    <section class="disclaimer-grid">
      <article class="disclaimer-card">
        <h2>Investment risk</h2>
        <p>
          Investing involves risk, including possible loss of principal. Prices can move quickly, past performance does not guarantee future results, and simulated results or projections may not reflect actual outcomes.
        </p>
      </article>

      <article class="disclaimer-card">
        <h2>Market data</h2>
        <p>
          Quotes, charts, news, alerts, dividends, currency conversions, and other data may be delayed, incomplete, inaccurate, or unavailable. Always verify important information with your broker, exchange, issuer, or another official source before making decisions.
        </p>
      </article>

      <article class="disclaimer-card">
        <h2>User responsibility</h2>
        <p>
          You are responsible for your own investment decisions and for reviewing the accuracy of imported transactions, fees, tax assumptions, holdings, watchlists, and calculations. Consult a qualified professional for advice based on your personal situation.
        </p>
      </article>

      <article class="disclaimer-card">
        <h2>No guarantees</h2>
        <p>
          StockFolio is provided without warranties about availability, accuracy, completeness, or fitness for a particular purpose. The app and its creator are not liable for losses or damages arising from your use of the app or reliance on its content.
        </p>
      </article>
    </section>

    <p class="closing text-muted">
      By using StockFolio, you acknowledge that you understand these limitations and agree to use the app as an informational portfolio tool.
    </p>
  </div>
</template>

<style scoped>
.disclaimer {
  height: 100%;
  overflow-y: auto;
  padding: 1rem;
}

@media (min-width: 768px) {
  .disclaimer {
    max-width: 980px;
    margin: 0 auto;
    padding: 2rem;
  }
}

.page-header {
  margin-bottom: 1rem;
}

.eyebrow {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin-bottom: 0.35rem;
  text-transform: uppercase;
}

.page-header h1 {
  font-size: 2rem;
  font-weight: 800;
  margin-bottom: 0.65rem;
}

.intro {
  color: var(--text-secondary);
  font-size: 0.98rem;
  line-height: 1.55;
  max-width: 760px;
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

.notice h2,
.disclaimer-card h2 {
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
  gap: 0.85rem;
}

@media (min-width: 780px) {
  .disclaimer-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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
