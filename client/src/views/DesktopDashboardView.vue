<script setup>
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
} from "vue";
import { useStorage } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import Menu from "primevue/menu";
import Select from "primevue/select";
import AddWatchlistModal from "@/components/modals/AddWatchlistModal.vue";
import ImportModal from "@/components/modals/ImportModal.vue";
import { useDashboardStore } from "@/stores/dashboard";
import { useAuthStore } from "@/stores/auth";
import { useDesktopFocusStore } from "@/stores/desktopFocus";
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
const WatchlistMoversCard = defineAsyncComponent(
  () => import("@/components/charts/WatchlistMoversCard.vue"),
);
const TrendingCard = defineAsyncComponent(
  () => import("@/components/charts/TrendingCard.vue"),
);
const DividendCalendarCard = defineAsyncComponent(
  () => import("@/components/charts/DividendCalendarCard.vue"),
);
const IncomeProjectionChart = defineAsyncComponent(
  () => import("@/components/charts/IncomeProjectionChart.vue"),
);

const emit = defineEmits(["open-account"]);
const dashboard = useDashboardStore();
const auth = useAuthStore();
const router = useRouter();
const desktopFocus = useDesktopFocusStore();
const { t } = useI18n();

const addMenu = ref(null);
const showAddModal = ref(false);
const showImportModal = ref(false);
const importMode = ref("watchlist");
const addMenuItems = computed(() => [
  {
    label: t("watchlist.addToWatchlist"),
    icon: "pi pi-eye",
    command: () => {
      showAddModal.value = true;
    },
  },
  { separator: true },
  {
    label: t("watchlist.importWatchlist"),
    icon: "pi pi-upload",
    command: () => {
      importMode.value = "watchlist";
      showImportModal.value = true;
    },
  },
  {
    label: t("watchlist.importHoldings"),
    icon: "pi pi-briefcase",
    command: () => {
      importMode.value = "holdings";
      showImportModal.value = true;
    },
  },
]);

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
  incomeMonths,
  incomeTotals,
  incomeLoading,
} = storeToRefs(dashboard);

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
  if (hour < 12) return t("dashboard.greetingMorning");
  if (hour < 18) return t("dashboard.greetingAfternoon");
  return t("dashboard.greetingEvening");
});

const combinedCurrency = useStorage('holdings-combined-currency', 'ILS')
const combinedDisplay = computed(() => {
  const c = portfolioCombinedUsd.value
  if (!c) return { value: 0, pnl: 0, pnlPercent: null, currency: 'USD' }
  if (combinedCurrency.value === 'ILS' && c.ilsToUsd > 0) {
    return { value: c.value / c.ilsToUsd, pnl: c.pnl / c.ilsToUsd, pnlPercent: c.pnlPercent, currency: 'ILS' }
  }
  return { value: c.value, pnl: c.pnl, pnlPercent: c.pnlPercent, currency: 'USD' }
})
const netWorth = computed(() => combinedDisplay.value.value)
const netWorthCurrency = computed(() => combinedDisplay.value.currency)
const monthChange = computed(() => {
  const c = portfolioCombinedUsd.value
  if (!c) return 0
  const ilsToUsd = c.ilsToUsd || 1
  const raw = c.dayPnl ?? 0
  return combinedCurrency.value === 'ILS' && ilsToUsd > 0 ? raw / ilsToUsd : raw
})
const monthChangePercent = computed(() => {
  const c = portfolioCombinedUsd.value
  if (!c) return null
  return c.dayPnlPercent ?? null
})
const latestHistoryDate = computed(() => {
  const last = history.value?.[history.value.length - 1]?.date;
  if (!last) return t("dashboard.latestClose");
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

function openAccount() {
  emit("open-account");
}

onMounted(async () => {
  try {
    auth.fetchMe().catch(() => {});
    await dashboard.initialize();
  } catch {}
});

onUnmounted(() => {
  dashboard.stopClock();
});
</script>

<template>
  <div class="desktop-home">
    <main class="home-main">
      <Teleport to="#layout-topbar-actions" defer>
        <div class="top-actions">
          <button
            v-tooltip.bottom="t('common.add')"
            class="top-action primary"
            type="button"
            @click="addMenu?.toggle($event)"
          >
            <i class="pi pi-plus" />
            <span>{{ t("common.add") }}</span>
          </button>
          <Menu ref="addMenu" :model="addMenuItems" popup />
          <button
            v-tooltip.bottom="t('nav.portfolioRecords')"
            class="top-action"
            type="button"
            @click="router.push('/records')"
          >
            <i class="pi pi-list" />
            <span>{{ t(`nav.records`) }}</span>
          </button>
        </div>
      </Teleport>

      <div class="home-scroll">
        <section class="home-hero">
          <div>
            <h1>{{ greeting }}, {{ firstName }}</h1>
            <p>{{ t(`dashboard.portfolioSummary`) }}</p>
          </div>
          <div class="freshness">
            <i class="pi pi-clock" />
            <span
              >{{ latestHistoryDate }} ·
              {{ t(`dashboard.typicallyOneDayBehind`) }}</span
            >
          </div>
        </section>

        <template v-if="ready">
          <section class="content-grid">
            <div class="left-column">
              <article class="folio-card net-card">
                <div class="metric-row">
                  <div>
                    <span class="metric-label">{{
                      t("dashboard.netWorth")
                    }}</span>
                    <strong class="net-worth">{{
                      useCurrency(netWorth, netWorthCurrency)
                    }}</strong>
                  </div>
                  <div>
                    <span class="metric-label">{{
                      t("dashboard.change")
                    }}</span>
                    <span
                      :class="gainLossClass(monthChange)"
                      class="change-value"
                    >
                      {{ monthChange >= 0 ? "+" : ""
                      }}{{ useCurrency(monthChange, netWorthCurrency) }}
                      <span v-if="monthChangePercent != null"
                        >({{ usePercent(monthChangePercent) }})</span
                      >
                    </span>
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
                  :hide-loading="true"
                  :loading="historyLoading"
                  :range="historyRange"
                />
              </article>

              <IncomeProjectionChart
                v-if="auth.canUsePremiumFeatures"
                class="folio-card income-home-card"
                :data="incomeMonths"
                :hide-loading="true"
                :loading="incomeLoading"
                :totals="incomeTotals"
              />
              <div v-else class="folio-card desktop-income-teaser">
                <i class="pi pi-crown desktop-teaser-crown"/>
                <span>{{ t('dashboard.incomeProjection') }}</span>
                <small>{{ t('common.premiumFeature') }}</small>
              </div>

              <PortfolioCompareChart
                v-if="portfolioPositions.length"
                :positions="portfolioPositions"
                :range="historyRange"
              />

              <section
                v-if="portfolioPositions.length"
                class="records-card folio-card"
              >
                <div class="records-head">
                  <h2>{{ t("dashboard.holdings") }}</h2>
                  <!-- <button type="button" @click="router.push('/transactions')">
                    <span>View all</span>
                    <i class="pi pi-arrow-right" />
                  </button> -->
                </div>
                <div class="records-table">
                  <div class="records-row records-header">
                    <span>{{ t("dashboard.colPosition") }}</span>
                    <span>{{ t("dashboard.colQuantity") }}</span>
                    <span>{{ t("dashboard.colUnitValue") }}</span>
                    <span>{{ t("dashboard.colTotalValue") }}</span>
                    <span>{{ t("dashboard.today") }}</span>
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
                :hide-loading="true"
                :items="watchlistMoversItems"
                :loading="watchlistMoversLoading"
                :max-items="7"
              />
              <DividendCalendarCard
                v-if="portfolioPositions.length"
                class="folio-card dividends-home-card"
                :hide-loading="true"
              />
              <TrendingCard v-else-if="showTrending" class="folio-card" />
              <MarketsCard
                class="folio-card markets-top-card"
                :desktop-layout="true"
                :hide-loading="true"
              />
            </div>
          </section>

          <div v-if="showEmpty" class="empty text-muted">
            {{ t("dashboard.empty") }}
          </div>
        </template>
      </div>
    </main>

    <AddWatchlistModal v-model:visible="showAddModal" />
    <ImportModal
      v-model:visible="showImportModal"
      :mode="importMode"
      @imported="() => {}"
    />
  </div>
</template>

<style scoped>
.desktop-home {
  --desktop-surface: var(--bg-primary);
  --desktop-panel: var(--bg-secondary);
  --desktop-card: var(--bg-card);
  --desktop-border: var(--border);
  --desktop-border-soft: color-mix(in srgb, var(--border) 82%, transparent);
  --desktop-text: var(--text-primary);
  --desktop-muted: var(--text-secondary);
  --desktop-hover: color-mix(in srgb, var(--text-primary) 6%, transparent);
  --desktop-hover-strong: color-mix(
    in srgb,
    var(--text-primary) 10%,
    transparent
  );
  --desktop-elevated-shadow: 0 1px 2px
    color-mix(in srgb, var(--text-primary) 8%, transparent);
  --desktop-overlay-shadow: 0 8px 24px
    color-mix(in srgb, var(--text-primary) 10%, transparent);
  display: grid;
  /* grid-template-columns: minmax(0, 1fr) minmax(360px, 25vw); */
  height: 100%;
  overflow: hidden;
  background: var(--desktop-surface);
  color: var(--desktop-text);
}

.desktop-home.ai-collapsed {
  grid-template-columns: minmax(0, 1fr);
}

.desktop-home.ai-collapsed .home-main {
  border-right: 0;
}

.desktop-home.ai-collapsed .advisor-rail {
  display: none;
}

.home-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--desktop-border);
  overflow-x: auto;
}

.top-actions,
.freshness,
.advisor-head,
.advisor-head button,
.top-action {
  display: flex;
  align-items: center;
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
  min-height: 36px;
  gap: 0.45rem;
  border: 1px solid var(--desktop-border);
  border-radius: 7px;
  background: var(--desktop-panel);
  color: var(--desktop-text);
  padding: 0 0.8rem;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--desktop-elevated-shadow);
}

.top-action i {
  font-size: 0.86rem;
}

.top-action-icon {
  width: 36px;
  min-width: 36px;
  padding: 0;
  justify-content: center;
}

.panel-toggle-glyph {
  position: relative;
  display: inline-flex;
  width: 15px;
  height: 15px;
  border: 1.7px solid currentColor;
  border-radius: 4px;
}

.panel-toggle-glyph::before {
  content: "";
  position: absolute;
  top: 1.6px;
  bottom: 1.6px;
  left: 4px;
  width: 1.7px;
  border-radius: 999px;
  background: currentColor;
}

.top-action.primary {
  background: var(--neon-blue);
  border-color: var(--neon-blue);
  color: #000;
}

:root[data-theme="light"] .top-action.primary {
  background: #1a6cf5;
  border-color: #1a6cf5;
  color: #fff;
}

.home-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem 1.5rem 2rem;
  max-width: 1400px;
  margin: 0 auto;
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
  font-size: 1.5rem;
  line-height: 1.15;
  font-weight: 400;
  letter-spacing: 0;
}

.home-hero p {
  margin: 0.25rem 0 0;
  color: var(--desktop-muted);
  font-size: 0.94rem;
}

.freshness {
  gap: 0.4rem;
  color: var(--desktop-muted);
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
  border: 1px solid var(--desktop-border);
  border-radius: 8px;
  background: var(--bg-card);
  box-shadow: none;
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
  color: var(--desktop-muted);
  font-size: 0.78rem;
  font-weight: 600;
}

.net-worth {
  display: block;
  color: var(--desktop-text);
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
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg-secondary);
}

.mode-switch button {
  min-width: 34px;
  min-height: 28px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.7rem;
}

.mode-switch button.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.mode-switch button i {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.period-select {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  border: 1px solid var(--desktop-border);
  border-radius: 9px;
  background: var(--desktop-panel);
  box-shadow: var(--desktop-elevated-shadow);
}

.period-select :deep(.p-select-label) {
  padding: 0.48rem 0 0.48rem 0.8rem;
  color: var(--desktop-text);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.1;
}

.period-select :deep(.p-select-dropdown) {
  width: 1.9rem;
  color: var(--desktop-muted);
}

.period-select :deep(.p-select-dropdown-icon) {
  font-size: 0.72rem;
}

:deep(.p-select-overlay.period-select-panel) {
  padding: 0.25rem;
  border: 1px solid var(--desktop-border);
  border-radius: 10px;
  background: var(--desktop-panel);
  box-shadow: var(--desktop-overlay-shadow);
}

:deep(.period-select-panel .p-select-list) {
  gap: 0.1rem;
}

:deep(.period-select-panel .p-select-option) {
  min-height: 36px;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  color: var(--desktop-muted);
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
  /* min-width: 760px; */
  padding: 0.72rem 1rem;
  border: 0;
  background: transparent;
  color: var(--desktop-text);
  text-align: left;
  font: inherit;
  font-size: 0.82rem;
}

button.records-row {
  cursor: pointer;
}

button.records-row:hover {
  background: var(--desktop-hover);
}

.records-header {
  color: var(--desktop-muted);
  background: transparent;
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
  color: var(--desktop-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.advisor-rail {
  display: flex;
  flex-direction: column;
  padding: 0.85rem 0.9rem;
  background: color-mix(
    in srgb,
    var(--desktop-panel) 90%,
    var(--desktop-surface)
  );
  overflow: hidden;
  border-left: 1px solid var(--desktop-border);
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

.advisor-actions {
  display: flex;
  align-items: center;
  flex-direction: row;
  gap: 0.35rem;
  flex-shrink: 0;
}

.advisor-actions :deep(.advisor-action-btn.p-button) {
  width: 32px;
  min-width: 32px;
  height: 32px;
  color: var(--desktop-muted);
  border: none;
  box-shadow: none;
}

.advisor-actions :deep(.advisor-action-btn.p-button:hover) {
  background: var(--desktop-hover);
  color: var(--desktop-text);
}

.advisor-head > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.advisor-head strong {
  font-size: 0.9rem;
}

.advisor-head span {
  color: var(--desktop-muted);
  font-size: 0.73rem;
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
  background: var(--desktop-panel);
  border: 1px solid var(--desktop-border);
  color: var(--desktop-muted);
  box-shadow: var(--desktop-elevated-shadow);
}

.advisor-hero-mark i {
  font-size: 1rem;
}

.advisor-hero strong {
  font-size: 0.98rem;
  font-weight: 750;
  color: var(--desktop-text);
}

.advisor-hero p {
  margin: 0;
  max-width: 260px;
  color: var(--desktop-muted);
  font-size: 0.78rem;
  line-height: 1.45;
}

.advisor-hero-cta {
  margin-top: 0.15rem;
}

.advisor-hero-cta:deep(.p-button) {
  min-height: 34px;
}

.advisor-hero-cta:deep(.p-button-label) {
  font-size: 0.78rem;
  font-weight: 700;
}

.consent-dialog-title {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.consent-dialog-title i {
  font-size: 1rem;
  color: var(--desktop-text);
  margin-top: 0.15rem;
}

.consent-dialog-title div {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.consent-dialog-title strong {
  font-size: 1.05rem;
  line-height: 1.15;
  color: var(--desktop-text);
}

.consent-dialog-title span {
  color: var(--desktop-muted);
  font-size: 0.86rem;
  line-height: 1.4;
}

.consent-card {
  overflow: hidden;
}

.consent-card :deep(.p-card-body) {
  padding: 1rem;
}

.consent-card :deep(.p-card-content) {
  padding: 0;
}

.consent-toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
}

.consent-switch-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  min-width: 36px;
  min-height: 28px;
  padding-top: 0.1rem;
}

.consent-switch-wrap :deep(.p-toggleswitch) {
  flex-shrink: 0;
}

.consent-copy {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.consent-copy strong {
  font-size: 0.95rem;
  color: var(--desktop-text);
}

.consent-copy p {
  margin: 0;
  color: var(--desktop-muted);
  font-size: 0.9rem;
  line-height: 1.45;
}

.consent-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
  width: 100%;
}

.consent-save:disabled {
  opacity: 0.72;
}

.suggestions {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding-top: 0.9rem;
  flex-shrink: 0;
}

.suggestions > span {
  color: var(--desktop-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.suggestions :deep(.suggestion-btn.p-button) {
  justify-content: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--desktop-text);
  font-size: 0.78rem;
  line-height: 1.35;
  font-weight: 650;
}

.suggestions :deep(.suggestion-btn.p-button .p-button-label) {
  color: var(--desktop-text);
  font-size: 0.78rem;
  line-height: 1.35;
  font-weight: 650;
  text-align: left;
  white-space: normal;
}

.suggestions :deep(.suggestion-btn.p-button:hover) {
  background: transparent;
  color: var(--desktop-text);
}

.suggestions :deep(.suggestion-btn.p-button:hover .p-button-label) {
  color: var(--desktop-text);
}

:deep(.breakdown-card),
:deep(.div-calendar-card),
:deep(.markets-card),
:deep(.income-card),
:deep(.movers-card) {
  border-radius: 8px;
  background: transparent;
  box-shadow: none;
}

:deep(.breakdown-card) {
  background: var(--desktop-panel);
  box-shadow: var(--desktop-elevated-shadow);
}

:deep(.compare-card) {
  background: transparent;
  box-shadow: none;
}

:deep(.breakdown-card),
:deep(.div-calendar-card),
:deep(.income-card),
:deep(.movers-card) {
  margin-bottom: 0;
}

:deep(.markets-card) {
  padding-left: 1rem;
  margin-bottom: 0;
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
  color: var(--desktop-text);
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
  border: 1px solid var(--desktop-border);
  border-radius: 8px;
  background: var(--desktop-panel);
  box-shadow: var(--desktop-elevated-shadow);
}

:deep(.ask-form input) {
  border: 0;
}

:deep(.ask-form input:focus) {
  box-shadow: none;
}

:deep(.ask-form button) {
  color: var(--desktop-muted);
}

.gain {
  color: var(--green);
}

.loss {
  color: var(--red);
}

@media (max-width: 1360px) {
  .desktop-home {
    grid-template-columns: minmax(0, 1fr) 25vw;
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

.desktop-income-teaser {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 2rem 1rem;
  min-height: 120px;
  text-align: center;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--accent) 6%, transparent),
    color-mix(in srgb, var(--accent) 2%, transparent)
  );
}

.desktop-teaser-crown {
  font-size: 1.5rem;
  color: #f59e0b;
}

.desktop-income-teaser span {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
}

.desktop-income-teaser small {
  font-size: 0.75rem;
  color: var(--text-secondary);
}
</style>
