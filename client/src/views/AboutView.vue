<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import QRCode from "qrcode";
import Button from "primevue/button";
import { useI18n } from "@/composables/useI18n";

const router = useRouter();
const toast = useToast();
const { t } = useI18n();

const BTC_ADDRESS = "bc1qdvuarupkqqxkpml6rmpnnnmwns84ll50tgl3v2";
const qrCanvas = ref(null);

const featureIcons = [
  "pi pi-chart-line",
  "pi pi-globe",
  "pi pi-money-bill",
  "pi pi-bell",
  "pi pi-bolt",
  "pi pi-clock",
  "pi pi-tags",
  "pi pi-upload",
];

onMounted(async () => {
  if (!qrCanvas.value) return;
  try {
    await QRCode.toCanvas(qrCanvas.value, `bitcoin:${BTC_ADDRESS}`, {
      width: 180,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {}
});

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(BTC_ADDRESS);
    toast.add({
      severity: "success",
      summary: t("aboutPage.addressCopied"),
      life: 2000,
    });
  } catch {
    toast.add({
      severity: "warn",
      summary: t("aboutPage.copyFailed"),
      life: 2500,
    });
  }
}
</script>

<template>
  <div class="about safe-bottom">
    <header class="page-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <h1 class="gradient-title">{{ t("common.about") }}</h1>
    </header>

    <div class="about-layout">
      <div class="main-col">
        <!-- Import guide -->
        <div class="screenshot-card">
          <div class="screenshot-label">{{ t("aboutPage.importGuide") }}</div>
          <img
            :alt="t('aboutPage.importAlt')"
            class="screenshot-img"
            src="/import-guide.svg"
          />
        </div>

        <!-- App intro -->
        <div class="intro-card">
          <div class="brand">
            <span class="brand-mark">📈</span>
            <span class="brand-name gradient-title">StockFolio</span>
          </div>
          <p class="tagline text-muted">
            {{ t("aboutPage.tagline") }}
          </p>
          <ul class="feature-list">
            <li v-for="(text, i) in t('aboutPage.features')" :key="text">
              <i :class="featureIcons[i]" /><span>{{ text }}</span>
            </li>
          </ul>
        </div>

        <p class="legal text-muted main-legal">
          © {{ new Date().getFullYear() }} StockFolio ·
          <a alt="www.handcoded.tech" href="//handcoded.tech">
            handcoded.tech </a
          >. {{ t("common.allRightsReserved") }}
        </p>
      </div>

      <div class="side-col">
        <!-- Donate -->
        <div class="donate-card">
          <h2 class="donate-title">{{ t("aboutPage.supportTitle") }}</h2>
          <p class="text-muted donate-sub">
            {{ t("aboutPage.supportText") }}
          </p>

          <div class="qr-wrap">
            <canvas ref="qrCanvas" class="qr" />
          </div>
          <div class="addr-label text-muted">
            {{ t("aboutPage.bitcoinAddress") }}
          </div>

          <div class="addr-row">
            <code class="addr">{{ BTC_ADDRESS }}</code>
            <button
              :title="t('common.copy')"
              class="copy-btn"
              @click="copyAddress"
            >
              <i class="pi pi-copy" />
            </button>
          </div>

          <div class="contact-block">
            <div class="text-muted contact-label">
              {{ t("common.contact") }}
            </div>
            <a
              class="contact-link"
              href="mailto:pavelspersonalhelper@gmail.com"
              >{{ t("common.emailMe") }}</a
            >
            <a
              class="contact-link"
              href="https://t.me/PashaArsha"
              rel="noopener noreferrer"
              target="_blank"
              >{{ t("common.telegramMe") }}</a
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screenshot-card {
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 1rem;
}

.screenshot-label {
  font-size: 0.7rem;
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

.about {
  padding: 1rem;
}
@media (min-width: 768px) {
  .about {
    padding: 1.5rem;
  }
}
@media (min-width: 1024px) {
  .about {
    padding: 2.5rem 3rem;
  }
}

.page-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 1.25rem;
}

.about-layout {
  display: flex;
  flex-direction: column;
}

@media (min-width: 1024px) {
  .about-layout {
    flex-direction: row;
    align-items: flex-start;
    gap: 2rem;
    max-width: 1100px;
    margin: 0 auto;
  }

  .main-col {
    flex: 1.7;
    min-width: 0;
  }

  .side-col {
    flex: 1;
    min-width: 0;
    position: sticky;
    top: 2.5rem;
  }
}

.intro-card,
.donate-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.1rem 1.25rem;
  margin-bottom: 1rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}
.brand-mark {
  font-size: 1.5rem;
}
.brand-name {
  font-size: 1.02rem;
  font-weight: 700;
}
.tagline {
  font-size: 0.85rem;
  line-height: 1.55;
  margin-bottom: 1rem;
}

.feature-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.feature-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 0.83rem;
  line-height: 1.5;
}
.feature-list i {
  color: var(--accent);
  font-size: 0.83rem;
  margin-top: 2px;
}

.donate-card {
  text-align: center;
}
.donate-title {
  font-size: 1.02rem;
  font-weight: 700;
  margin-bottom: 0.35rem;
}
.donate-sub {
  font-size: 0.85rem;
  line-height: 1.55;
  margin-bottom: 1.1rem;
}

.qr-wrap {
  display: inline-flex;
  padding: 12px;
  background: #fff;
  border-radius: 16px;
}
.qr {
  display: block;
  width: 180px;
  height: 180px;
}
.addr-label {
  font-size: 0.83rem;
  margin: 0.75rem 0 0.4rem;
}

.addr-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
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
.copy-btn:active {
  color: var(--accent);
}

.contact-block {
  margin-top: 1rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.contact-label {
  font-size: 0.83rem;
  margin-bottom: 0.25rem;
}

.contact-link {
  color: var(--accent);
  font-size: 0.85rem;
  word-break: break-all;
  text-decoration: underline;
  text-underline-offset: 0.18em;
  text-decoration-thickness: 0.08em;
}

.legal {
  text-align: center;
  font-size: 0.72rem;
  margin-top: 0.5rem;
}
</style>
