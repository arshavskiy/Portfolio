<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted } from "vue";
import { useStorage } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import Select from "primevue/select";
import { useDashboardStore } from "@/stores/dashboard";
import { useAuthStore } from "@/stores/auth";
import { useDesktopFocusStore } from "@/stores/desktopFocus";
import { useAiChatStore } from "@/stores/aiChat";
import AskPortfolioPanel from "@/components/ui/AskPortfolioPanel.vue";
import AppLoader from "@/components/ui/AppLoader.vue";
import {
  gainLossClass,
  useCurrency,
  usePercent,
  useTickerCurrency,
} from "@/composables/useFormat";
import { useI18n } from "@/composables/useI18n";

const BreakdownCard = defineAsyncComponent(
  () => import("@/components/charts/BreakdownCard.vue"),
);
const PortfolioHistoryChart = defineAsyncComponent(
  () => import("@/components/charts/PortfolioHistoryChart.vue"),
);
const PortfolioCompareChart = defineAsyncComponent(
  () => import("@/components/charts/PortfolioCompareChart.vue"),
);
const MarketsCard = defineAsyncComponent(
  () => import("@/components/charts/MarketsCard.vue"),
);
const NewsCard = defineAsyncComponent(
  () => import("@/components/charts/NewsCard.vue"),
);
const WatchlistMoversCard = defineAsyncComponent(
  () => import("@/components/charts/WatchlistMoversCard.vue"),
);
const TrendingCard = defineAsyncComponent(
  () => import("@/components/charts/TrendingCard.vue"),
);
const DividendCalendarCard = defineAsyncComponent(
  () => import("@/components/charts/DividendCalendarCard.vue"),
);

const emit = defineEmits(["open-account"]);
const dashboard = useDashboardStore();
const auth = useAuthStore();
const aiChat = useAiChatStore();
const router = useRouter();
const desktopFocus = useDesktopFocusStore();
const { t } = useI18n();
const aiPanelCollapsed = useStorage("desktop-ai-panel-collapsed", false);
const menuCollapsed = useStorage("desktop-menu-collapsed", false);

const {
  ready,
  portfolioPositions,
  portfolioCombinedUsd,
  watchlistMoversItems,
  watchlistMoversLoading,
  showTrending,
  showEmpty,
  history,
  historyLoading,
  historyRange,
} = storeToRefs(dashboard);
const { messages: advisorMessages } = storeToRefs(aiChat);

const HISTORY_RANGES = [
  { label: "1D", value: "1d" },
  { label: "1W", value: "1wk" },
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
];

const firstName = computed(() => {
  const name = auth.user?.name || auth.user?.email || "";
  return name.trim().split(/\s+/)[0] || "there";
});

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
});

const netWorth = computed(() => portfolioCombinedUsd.value?.value ?? 0);
const monthChange = computed(
  () =>
    portfolioCombinedUsd.value?.pnl ?? portfolioCombinedUsd.value?.dayPnl ?? 0,
);
const monthChangePercent = computed(
  () =>
    portfolioCombinedUsd.value?.pnlPercent ??
    portfolioCombinedUsd.value?.dayPnlPercent ??
    null,
);
const latestHistoryDate = computed(() => {
  const last = history.value?.[history.value.length - 1]?.date;
  if (!last) return "Latest close";
  return new Date(last).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
});

const portfolioRows = computed(() =>
  portfolioPositions.value
    .slice()
    .sort((a, b) => (b.valueUsd ?? b.value ?? 0) - (a.valueUsd ?? a.value ?? 0))
    .slice(0, 7),
);

const suggestionPrompts = [
  "What would happen to my portfolio if the market drops 30% tomorrow?",
  "Which holdings are carrying the most concentration risk?",
  "How should I rebalance while keeping upside potential?",
  "Which watchlist names look most interesting today?",
];
const historyRangeOptions = HISTORY_RANGES.map((item) => ({
  label: item.label,
  value: item.value,
}));

function openPosition(position) {
  if (!position?.ticker) return;
  desktopFocus.focus(
    position.ticker,
    position.companyName || position.name || "",
  );
  router.push(`/position/${encodeURIComponent(position.ticker)}`);
}

function toggleAiPanel() {
  aiPanelCollapsed.value = !aiPanelCollapsed.value;
}

function toggleMenu() {
  menuCollapsed.value = !menuCollapsed.value;
}

function openAccount() {
  emit("open-account");
}

onMounted(async () => {
  try {
    await dashboard.initialize();
  } catch {}
});

onUnmounted(() => {
  dashboard.stopClock();
});
</script>

<template>
  <div class="desktop-home" :class="{ 'ai-collapsed': aiPanelCollapsed }">
    <main class="home-main">
      <header class="home-topbar">
        <div class="crumbs">
          <button
            v-tooltip.bottom="menuCollapsed ? 'Open menu' : 'Collapse menu'"
            class="crumb-toggle"
            type="button"
            @click="toggleMenu"
          >
            <i class="pi pi-window-maximize" />
          </button>
          <span>Home</span>
        </div>
        <div class="top-actions">
          <button
            v-tooltip.bottom="'Add'"
            class="top-action primary"
            type="button"
            @click="router.push('/watchlist')"
          >
            <i class="pi pi-plus" />
            <span>{{ t("common.add") }}</span>
          </button>
          <button
            v-tooltip.bottom="'Portfolio records'"
            class="top-action"
            type="button"
            @click="router.push('/transactions')"
          >
            <i class="pi pi-list" />
            <span>Records</span>
          </button>
          <button
            v-tooltip.bottom="'Open AI chat'"
            class="top-action"
            type="button"
            @click="router.push('/assistant')"
          >
            <i class="pi pi-comments" />
            <span>AI Chat</span>
          </button>
          <button
            v-tooltip.bottom="
              aiPanelCollapsed ? 'Show AI panel' : 'Hide AI panel'
            "
            class="top-action"
            type="button"
            @click="toggleAiPanel"
          >
            <i class="pi pi-window-maximize" />
            <span>{{ aiPanelCollapsed ? "Show panel" : "Hide panel" }}</span>
          </button>
        </div>
      </header>

      <div class="home-scroll">
        <section class="home-hero">
          <div>
            <h1>{{ greeting }}, {{ firstName }}</h1>
            <p>Here’s your portfolio summary</p>
          </div>
          <div class="freshness">
            <i class="pi pi-clock" />
            <span>{{ latestHistoryDate }} · typically one day behind</span>
          </div>
        </section>

        <div v-if="!ready" class="dash-loader">
          <div v-for="n in 5" :key="n" class="dash-skeleton" />
        </div>

        <template v-else>
          <section class="content-grid">
            <div class="left-column">
              <article class="folio-card net-card">
                <div class="metric-row">
                  <div>
                    <span class="metric-label">Net Worth</span>
                    <strong class="net-worth">{{
                      useCurrency(netWorth, "USD")
                    }}</strong>
                  </div>
                  <div>
                    <span class="metric-label">Change</span>
                    <strong
                      :class="gainLossClass(monthChange)"
                      class="change-value"
                    >
                      {{ monthChange >= 0 ? "+" : ""
                      }}{{ useCurrency(monthChange, "USD") }}
                      <span v-if="monthChangePercent != null"
                        >({{ usePercent(monthChangePercent) }})</span
                      >
                    </strong>
                  </div>
                  <div class="chart-controls">
                    <Select
                      :model-value="historyRange"
                      :options="historyRangeOptions"
                      class="period-select"
                      overlay-class="period-select-panel"
                      option-label="label"
                      option-value="value"
                      size="small"
                      @update:model-value="dashboard.setHistoryRange"
                    />
                  </div>
                </div>
                <PortfolioHistoryChart
                  :key="historyRange"
                  :data="history"
                  :day-pnl="portfolioCombinedUsd?.dayPnl"
                  :loading="historyLoading"
                  :range="historyRange"
                />
              </article>

              <PortfolioCompareChart
                v-if="portfolioPositions.length"
                :positions="portfolioPositions"
                :range="historyRange"
              />

              <NewsCard class="folio-card news-home-card" />

              <section
                v-if="portfolioPositions.length"
                class="records-card folio-card"
              >
                <div class="records-head">
                  <h2>Portfolio Records</h2>
                  <button type="button" @click="router.push('/transactions')">
                    <span>View all</span>
                    <i class="pi pi-arrow-right" />
                  </button>
                </div>
                <div class="records-table">
                  <div class="records-row records-header">
                    <span>Position</span>
                    <span>Quantity</span>
                    <span>Unit Value</span>
                    <span>Total Value</span>
                    <span>Today</span>
                  </div>
                  <button
                    v-for="position in portfolioRows"
                    :key="position.ticker"
                    class="records-row"
                    type="button"
                    @click="openPosition(position)"
                  >
                    <span>
                      <strong>{{ position.ticker }}</strong>
                      <small>{{
                        position.companyName || position.name || position.ticker
                      }}</small>
                    </span>
                    <span>{{
                      position.shares ?? position.quantity ?? "—"
                    }}</span>
                    <span>{{
                      useTickerCurrency(
                        position.currentPrice ?? position.price,
                        position.ticker,
                      )
                    }}</span>
                    <span>{{
                      useTickerCurrency(position.value, position.ticker)
                    }}</span>
                    <span :class="gainLossClass(position.changePercent)">
                      {{ usePercent(position.changePercent) }}
                    </span>
                  </button>
                </div>
              </section>

            </div>

            <div class="right-stack">
              <BreakdownCard
                class="folio-card allocation-card"
                :combined-usd="portfolioCombinedUsd"
                :positions="portfolioPositions"
              />
              <WatchlistMoversCard
                class="folio-card movers-top-card"
                :items="watchlistMoversItems"
                :loading="watchlistMoversLoading"
              />
              <DividendCalendarCard
                v-if="portfolioPositions.length"
                class="folio-card dividends-home-card"
              />
              <TrendingCard v-else-if="showTrending" class="folio-card" />
              <MarketsCard class="folio-card markets-top-card" />
            </div>
          </section>

          <div v-if="showEmpty" class="empty text-muted">
            {{ t("dashboard.empty") }}
          </div>
        </template>
      </div>
    </main>

    <aside class="advisor-rail" :class="{ collapsed: aiPanelCollapsed }">
      <div class="advisor-head">
        <div>
          <strong>AI Chat</strong>
          <span>Portfolio advisor</span>
        </div>
      </div>
      <div v-if="!advisorMessages.length" class="advisor-hero">
        <span class="advisor-hero-mark">
          <i class="pi pi-comments" />
        </span>
        <strong>Folio advisor</strong>
        <p>Ask about risk, concentration, rebalancing, and what moved today.</p>
      </div>
      <AskPortfolioPanel class="advisor-panel" />
      <div class="suggestions">
        <span>Suggestions</span>
        <button v-for="prompt in suggestionPrompts" :key="prompt" type="button">
          {{ prompt }}
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.desktop-home {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 30vw);
  height: 100%;
  overflow: hidden;
  background: #fbfaf8;
  color: #232323;
}

.desktop-home.ai-collapsed {
  grid-template-columns: minmax(0, 1fr);
}

.home-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e8e2de;
  overflow-x: auto;
}

.home-topbar {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 1rem;
  border-bottom: 1px solid #ece7e3;
  background: rgba(255, 255, 255, 0.76);
  backdrop-filter: blur(18px);
  flex-shrink: 0;
}

.crumbs,
.top-actions,
.freshness,
.advisor-head,
.advisor-head button,
.top-action {
  display: flex;
  align-items: center;
}

.crumbs {
  gap: 0.65rem;
  color: #817a74;
  font-size: 0.82rem;
  font-weight: 600;
}

.crumb-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px solid #e8e2de;
  border-radius: 8px;
  background: #fff;
  color: #7d746d;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(38, 32, 27, 0.04);
}

.crumb-toggle i {
  font-size: 1rem;
}

.crumbs i {
  font-size: 0.76rem;
}

.top-actions {
  gap: 0.45rem;
  flex-wrap: wrap;
}

.account-action {
  width: 40px;
  padding: 0;
}

.account-corner-action {
  border-radius: 999px;
  border-color: #e8e2de;
}

.top-action,
.advisor-head button,
.records-head button {
  min-height: 34px;
  gap: 0.45rem;
  border: 1px solid #e4ded9;
  border-radius: 7px;
  background: #fff;
  color: #393633;
  padding: 0 0.75rem;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(40, 34, 28, 0.04);
}

.top-action.primary {
  background: #111;
  border-color: #111;
  color: #fff;
}

.home-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.35rem 1.5rem 2rem;
}

.home-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.home-hero h1 {
  margin: 0;
  font-size: 1.55rem;
  line-height: 1.15;
  font-weight: 750;
  letter-spacing: 0;
}

.home-hero p {
  margin: 0.25rem 0 0;
  color: #827a73;
  font-size: 0.94rem;
}

.freshness {
  gap: 0.4rem;
  color: #9a918b;
  font-size: 0.75rem;
  font-weight: 600;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
  gap: 0.9rem;
  margin-bottom: 0.9rem;
}

.left-column,
.right-stack {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  min-width: 0;
}

.folio-card {
  border: 1px solid #e8e2de;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(38, 32, 27, 0.035);
}

.net-card {
  padding: 1rem 1.15rem;
  min-height: 270px;
}

.metric-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(180px, 1fr) auto;
  align-items: start;
  gap: 1rem;
  margin-bottom: 0.45rem;
}

.metric-label {
  display: block;
  margin-bottom: 0.3rem;
  color: #8f8780;
  font-size: 0.78rem;
  font-weight: 600;
}

.net-worth {
  display: block;
  color: #1f1f1f;
  font-size: 1.3rem;
  line-height: 1.1;
  letter-spacing: 0;
}

.change-value {
  display: block;
  font-size: 0.94rem;
  line-height: 1.35;
}

.chart-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  justify-self: end;
}

.mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid #eee8e4;
  border-radius: 9px;
  background: #fbf7f4;
}

.mode-switch button {
  min-width: 34px;
  min-height: 28px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #7c746d;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.7rem;
}

.mode-switch button.active {
  background: #fff;
  color: #1f1f1f;
  box-shadow: 0 1px 3px rgba(40, 34, 28, 0.08);
}

.mode-switch button i {
  font-size: 0.72rem;
  color: #a39890;
}

.period-select {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  border: 1px solid #e4ded9;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(40, 34, 28, 0.04);
}

.period-select :deep(.p-select-label) {
  padding: 0.48rem 0 0.48rem 0.8rem;
  color: #393633;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.1;
}

.period-select :deep(.p-select-dropdown) {
  width: 1.9rem;
  color: #817870;
}

.period-select :deep(.p-select-dropdown-icon) {
  font-size: 0.72rem;
}

:deep(.p-select-overlay.period-select-panel) {
  padding: 0.25rem;
  border: 1px solid #e4ded9;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(40, 34, 28, 0.08);
}

:deep(.period-select-panel .p-select-list) {
  gap: 0.1rem;
}

:deep(.period-select-panel .p-select-option) {
  min-height: 36px;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  color: #817870;
  font-size: 0.78rem;
  font-weight: 600;
}

.allocation-card {
  margin: 0;
  min-height: 0;
}

.markets-top-card {
  min-height: 140px;
}

.movers-top-card {
  min-height: 220px;
}

.news-home-card,
.dividends-home-card {
  margin: 0;
}

.records-card {
  overflow: hidden;
  margin-bottom: 0.9rem;
}

.records-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #eee8e4;
}

.records-head h2 {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 750;
}

.records-head button {
  display: inline-flex;
}

.records-table {
  width: 100%;
  overflow-x: auto;
}

.records-row {
  display: grid;
  grid-template-columns:
    minmax(180px, 1.4fr) minmax(90px, 0.6fr) minmax(100px, 0.75fr)
    minmax(110px, 0.8fr) minmax(76px, 0.55fr);
  gap: 1rem;
  align-items: center;
  width: 100%;
  min-width: 760px;
  padding: 0.72rem 1rem;
  border: 0;
  border-bottom: 1px solid #f0ebe7;
  background: transparent;
  color: #393633;
  text-align: left;
  font: inherit;
  font-size: 0.82rem;
}

button.records-row {
  cursor: pointer;
}

button.records-row:hover {
  background: #fbf7f4;
}

.records-header {
  color: #8e867f;
  background: #fcf8f6;
  font-size: 0.78rem;
  font-weight: 700;
}

.records-row strong,
.records-row small {
  display: block;
}

.records-row strong {
  font-size: 0.84rem;
}

.records-row small {
  max-width: 230px;
  overflow: hidden;
  color: #8e867f;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.advisor-rail {
  display: flex;
  flex-direction: column;
  padding: 0.85rem 0.9rem;
  background: #fff9f7;
  overflow: hidden;
  border-left: 1px solid #e8e2de;
  transition:
    width 0.22s ease,
    min-width 0.22s ease,
    max-width 0.22s ease,
    padding 0.22s ease,
    opacity 0.18s ease,
    border-color 0.22s ease;
  opacity: 1;
}

.advisor-rail.collapsed {
  width: 0;
  min-width: 0;
  max-width: 0;
  padding-left: 0;
  padding-right: 0;
  border-left-color: transparent;
  opacity: 0;
  pointer-events: none;
}

.advisor-head {
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.65rem;
  flex-shrink: 0;
}

.advisor-head div {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.advisor-head strong {
  font-size: 0.9rem;
}

.advisor-head span {
  color: #8c837c;
  font-size: 0.73rem;
}

.advisor-head button {
  min-height: 30px;
  padding: 0 0.55rem;
  border-radius: 8px;
  font-size: 0.72rem;
}

.advisor-panel {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.advisor-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 1rem 0.95rem;
  text-align: center;
  flex-shrink: 0;
}

.advisor-hero-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #ece3de;
  color: #a08f84;
  box-shadow: 0 1px 2px rgba(40, 34, 28, 0.05);
}

.advisor-hero-mark i {
  font-size: 1rem;
}

.advisor-hero strong {
  font-size: 0.98rem;
  font-weight: 750;
  color: #2f2a27;
}

.advisor-hero p {
  margin: 0;
  max-width: 260px;
  color: #8c837c;
  font-size: 0.78rem;
  line-height: 1.45;
}

.suggestions {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding-top: 0.9rem;
  flex-shrink: 0;
}

.suggestions > span {
  color: #9b928b;
  font-size: 0.78rem;
  font-weight: 700;
}

.suggestions button {
  border: 0;
  background: transparent;
  color: #3a3632;
  text-align: left;
  font-size: 0.78rem;
  line-height: 1.35;
  font-weight: 650;
  cursor: default;
}

.dash-loader {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 0.9rem;
}

.dash-skeleton {
  min-height: 150px;
  border: 1px solid #e8e2de;
  border-radius: 8px;
  background: linear-gradient(90deg, #fff 25%, #f7f1ed 50%, #fff 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

.dash-skeleton:first-child {
  min-height: 300px;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

:deep(.breakdown-card),
:deep(.div-calendar-card),
:deep(.markets-card),
:deep(.news-card),
:deep(.movers-card) {
  border-radius: 8px;
  background: #fff;
  box-shadow: none;
}

:deep(.breakdown-card),
:deep(.div-calendar-card),
:deep(.news-card),
:deep(.movers-card) {
  margin-bottom: 0;
}

:deep(.markets-card) {
  padding-left: 1rem;
  margin-bottom: 0;
}

:deep(.news-grid) {
  grid-template-columns: 1fr;
}

:deep(.movers-card) {
  padding-bottom: 0.85rem;
}

:deep(.movers-chart),
:deep(.movers-pairs) {
  min-height: 180px;
}

:deep(.mover-half) {
  min-height: 90px;
}

:deep(.card-title),
:deep(.section-title) {
  background: none;
  -webkit-text-fill-color: currentColor;
  color: #34302d;
  letter-spacing: 0;
  text-transform: none;
  font-size: 0.98rem;
}

:deep(.hist-svg) {
  height: 180px;
}

:deep(.hist-state) {
  height: 180px;
}

:deep(.ask-panel-body) {
  height: 100%;
}

:deep(.ask-chat),
:deep(.ask-empty) {
  min-height: 0;
  max-height: none;
  flex: 1;
}

:deep(.ask-body-top) {
  display: none;
}

:deep(.ask-form) {
  border: 1px solid #e8e2de;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(38, 32, 27, 0.04);
}

:deep(.ask-form input) {
  border: 0;
}

:deep(.ask-form input:focus) {
  box-shadow: none;
}

:deep(.ask-form button) {
  color: #68615b;
}

.gain {
  color: #15b76a;
}

.loss {
  color: #d64b5f;
}

@media (max-width: 1360px) {
  .desktop-home {
    grid-template-columns: minmax(0, 1fr) 30vw;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }

  .metric-row {
    grid-template-columns: 1fr 1fr;
  }

  .chart-controls {
    grid-column: 1 / -1;
    justify-self: start;
    flex-wrap: wrap;
  }
}
</style>
