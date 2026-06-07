<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import QRCode from 'qrcode'
import Button from 'primevue/button'

const router = useRouter()
const toast = useToast()

const BTC_ADDRESS = 'bc1qdvuarupkqqxkpml6rmpnnnmwns84ll50tgl3v2'
const qrCanvas = ref(null)

const features = [
  { icon: 'pi pi-chart-line', text: 'Live portfolio tracking with range-based performance and current-price charts' },
  { icon: 'pi pi-globe', text: 'Coverage for US stocks, TASE, global markets, and crypto watchlists' },
  { icon: 'pi pi-briefcase', text: 'Compact holdings and watchlist rows with timeframe start/end price labels' },
  { icon: 'pi pi-bell', text: 'Price alerts and per-ticker monitoring directly from stock pages' },
  { icon: 'pi pi-bolt', text: 'Dashboard cards for markets, trending symbols, and live market-hours status' },
  { icon: 'pi pi-tags', text: 'Sector-first organization with editable groups for holdings and watchlist items' },
  { icon: 'pi pi-upload', text: 'Import from Excel / CSV and manage positions with buy, sell, and lot details' },
]

onMounted(async () => {
  if (!qrCanvas.value) return
  try {
    await QRCode.toCanvas(qrCanvas.value, `bitcoin:${BTC_ADDRESS}`, {
      width: 180,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    })
  } catch {}
})

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(BTC_ADDRESS)
    toast.add({ severity: 'success', summary: 'Address copied', life: 2000 })
  } catch {
    toast.add({ severity: 'warn', summary: 'Copy failed — select it manually', life: 2500 })
  }
}
</script>

<template>
  <div class="about safe-bottom">
    <header class="page-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <h1 class="gradient-title">About</h1>
    </header>

    <!-- App intro -->
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

    <!-- Donate -->
    <div class="donate-card">
      <h2 class="donate-title">Support StockFolio</h2>
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

    <p class="legal text-muted">© {{ new Date().getFullYear() }} StockFolio · handcoded.tech. All rights reserved.</p>
  </div>
</template>

<style scoped>
.about { padding: 1rem; }
@media (min-width: 768px) { .about { padding: 1.5rem; max-width: 640px; } }

.page-header { display: flex; align-items: center; gap: 0.25rem; margin-bottom: 1.25rem; }
.page-header h1 { font-size: 1.5rem; }

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

.qr-wrap {
  display: inline-flex;
  padding: 12px;
  background: #fff;
  border-radius: 16px;
}
.qr { display: block; width: 180px; height: 180px; }
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

.contact-label {
  font-size: 0.78rem;
  margin-bottom: 0.25rem;
}

.contact-link {
  color: var(--accent);
  font-size: 0.86rem;
  word-break: break-all;
  text-decoration: underline;
  text-underline-offset: 0.18em;
  text-decoration-thickness: 0.08em;
}

.legal { text-align: center; font-size: 0.72rem; margin-top: 0.5rem; }
</style>
