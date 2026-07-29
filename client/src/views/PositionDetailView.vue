<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import {
  gainLossClass,
  useCurrency,
  useLargeNumber,
  usePercent,
  useTickerCurrency,
} from "@/composables/useFormat";
import { useI18n } from "@/composables/useI18n";
import { useFeeProfileStore } from "@/stores/feeProfiles";
import { useHistoryStore } from "@/stores/history";
import { useWatchlistStore } from "@/stores/watchlist";
import { useAlertsStore } from "@/stores/alerts";
import { useAuthStore } from "@/stores/auth";
import api from "@/composables/useApi";
import { fetchCachedQuote } from "@/composables/useQuoteCache";
import {
  getMarketHoursState,
  isRegularSessionBar,
  MARKET_HOURS_BY_GROUP,
} from "@/composables/useMarketHours";
import { useTour } from "@/composables/useTour";
// Momentum disabled for now — see useMomentumScore.js
// import {buildBreakdown, signalFromScore, useListMomentumScores} from '@/composables/useMomentumScore'
// import {useMomentumStore} from '@/stores/momentum'
import Button from "primevue/button";
import Tag from "primevue/tag";
import InputNumber from "primevue/inputnumber";
import Select from "primevue/select";
import AddTransactionModal from "@/components/ui/AddTransactionModal.vue";
import AlertModal from "@/components/ui/AlertModal.vue";
import DividendModal from "@/components/ui/DividendModal.vue";
import EditTransactionModal from "@/components/ui/EditTransactionModal.vue";
import StockChart from "@/components/charts/StockChart.vue";
import TickerInsightCard from "@/components/charts/TickerInsightCard.vue";
import AnalystResearchCard from "@/components/charts/AnalystResearchCard.vue";
import TickerRelationGraph from "@/components/charts/TickerRelationGraph.vue";
import RangeBar from "@/components/ui/RangeBar.vue";
import AppLoader from "@/components/ui/AppLoader.vue";

const BUILTIN_FEE_PROFILES = [
  {
    _id: "builtin:blink-plus",
    builtin: true,
    name: "בלינק Plus",
    currency: "USD",
    buyFee: { type: "perShare", value: 0.01, minFee: 1.5 },
    sellFee: { type: "perShare", value: 0.01, minFee: 1.5 },
    capitalGainsTax: 25,
    monthlyUsage: { transactions: 10, shares: 1000 },
  },
];

const props = defineProps({
  tickerOverride: { type: String, default: null },
  panelMode: { type: Boolean, default: false },
});

const route = useRoute();
const router = useRouter();
const toast = useToast();
const historyStore = useHistoryStore();
const watchlistStore = useWatchlistStore();
const alertsStore = useAlertsStore();
const auth = useAuthStore();
const { t } = useI18n();
const { maybeStartPositionPhase } = useTour();

const ticker = computed(() =>
  props.tickerOverride
    ? props.tickerOverride.toUpperCase()
    : decodeURIComponent(route.params.ticker ?? "").toUpperCase(),
);
const transactions = ref([]);
const quote = ref(null);
const currentPrice = ref(null);
const companyName = ref("");
const loading = ref(false);
const watchedItem = ref(null);
const showModal = ref(false);
const showAlertModal = ref(false);
const showDividendModal = ref(false);
const showSimulator = ref(true);
const simulatorTab = ref("buy");
const editingTx = ref(null);
const simPrice = ref(null);
const simValue = ref(null);
const simShares = ref(null);
const simFeeProfileId = ref(undefined);
const sellSimulationCosts = ref(null);
let sellSimulationRequestId = 0;
let syncingSellInputs = false;
const buySimShares = ref(null);
const buySimPrice = ref(null);
const buySimFeeProfileId = ref(undefined);
const buySimMode = ref("amount"); // 'amount' | 'target' | 'shares'
const buySimAmount = ref(null); // total budget (mode: amount)
const buySimTargetAvg = ref(null); // desired avg cost (mode: target)
const BUY_SIM_MODES = computed(() => [
  { label: t("positionDetail.modeAmount"), value: "amount" },
  { label: t("positionDetail.modeTargetAvg"), value: "target" },
  { label: t("positionDetail.modeShares"), value: "shares" },
]);
const feeStore = useFeeProfileStore();
const history = ref([]);
const chartLoading = ref(false);
const selectedChartPoints = ref([]);
const ilsToUsd = ref(null);
const now = ref(new Date());
const selectedRange = ref("1d");
const chartMode = ref("line");
const watchlistNavTickers = ref([]);
let refreshTimer = null;
let pageRequestId = 0;
const WATCHLIST_TICKER_KEY = "watchlist-opened-ticker";
const WATCHLIST_RETURN_KEY = "watchlist-return-from-position";
const WATCHLIST_NAV_KEY = "watchlist-filtered-tickers";
const CHART_SELECTION_HELP_KEY = "position-chart-selection-help-dismissed";
const RANGE_LABELS = {
  "1d": "1D",
  "5d": "5D",
  "1mo": "1M",
  "6mo": "6M",
  "1y": "1Y",
};
const chartSelectionHelpDismissed = ref(
  localStorage.getItem(CHART_SELECTION_HELP_KEY) === "1",
);

onMounted(async () => {
  loadWatchlistNavContext();
  alertsStore.fetchAlerts().catch(() => {});
  if (!feeStore.profiles.length) await feeStore.fetchProfiles();
  await loadPositionData();
  startAutoRefresh();
  maybeStartPositionPhase();
});
onUnmounted(() => clearInterval(refreshTimer));

// ── Position journal (thesis notes) ──
const showJournal = ref(false);
const journalNotes = ref("");
const journalSavedNotes = ref("");
const journalSaving = ref(false);

async function loadJournal() {
  try {
    const data = await api.get(
      `/portfolio/position/notes/${encodeURIComponent(ticker.value)}`,
    );
    journalNotes.value = data?.notes || "";
    journalSavedNotes.value = journalNotes.value;
  } catch {
    journalNotes.value = "";
    journalSavedNotes.value = "";
  }
}

async function saveJournal() {
  journalSaving.value = true;
  try {
    const data = await api.put(
      `/portfolio/position/notes/${encodeURIComponent(ticker.value)}`,
      { notes: journalNotes.value },
    );
    journalSavedNotes.value = data?.notes ?? journalNotes.value;
    toast.add({ severity: "success", summary: t("journal.saved"), life: 2000 });
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("journal.saveFailed"),
      detail: err.message,
      life: 3000,
    });
  } finally {
    journalSaving.value = false;
  }
}

const journalDirty = computed(
  () => journalNotes.value !== journalSavedNotes.value,
);

// ── Price targets (active alerts as distance-to-target bars) ──
const priceTargets = computed(() => {
  const price = currentPrice.value;
  return alertsStore
    .forTicker(ticker.value)
    .filter((a) => a.active)
    .map((a) => {
      if (!price || !a.target)
        return { ...a, progress: 0, distancePct: null, hit: false };
      const distancePct = ((a.target - price) / price) * 100;
      const hit =
        a.condition === "above" ? price >= a.target : price <= a.target;
      const progress = hit
        ? 100
        : Math.max(
            0,
            Math.min(
              100,
              a.condition === "above"
                ? (price / a.target) * 100
                : (a.target / price) * 100,
            ),
          );
      return { ...a, progress, distancePct, hit };
    })
    .sort(
      (a, b) =>
        Math.abs(a.distancePct ?? Infinity) -
        Math.abs(b.distancePct ?? Infinity),
    );
});

// Pre-fill sim price with current price once loaded
watch(currentPrice, (p) => {
  if (p && !simPrice.value) simPrice.value = p;
  if (!simShares.value && summary.value?.shares > 0) simShares.value = summary.value.shares;
  if (p && !simValue.value && summary.value?.shares > 0) {
    simValue.value = p * (simShares.value || summary.value.shares);
  }
  if (p && !buySimPrice.value) buySimPrice.value = p;
});
watch(selectedRange, loadHistory);
watch(ticker, async () => {
  loadWatchlistNavContext();
  transactions.value = [];
  quote.value = null;
  currentPrice.value = null;
  companyName.value = "";
  watchedItem.value = null;
  selectedChartPoints.value = [];
  await loadPositionData();
  startAutoRefresh();
});

async function loadPositionData() {
  const requestId = ++pageRequestId;
  loading.value = true;
  try {
    await Promise.all([
      fetchLots(),
      fetchQuote(),
      loadHistory(),
      loadFx(),
      fetchWatchlistItem(),
      loadJournal(),
    ]);
  } finally {
    if (requestId === pageRequestId) loading.value = false;
  }
}

async function fetchLots() {
  try {
    const data = await api.get(
      `/portfolio/transactions?ticker=${encodeURIComponent(ticker.value)}&limit=500`,
    );
    transactions.value = data.transactions.sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("stockDetail.failedLoad"),
      detail: err.message,
      life: 3000,
    });
  }
}

async function fetchQuote() {
  try {
    const q = await fetchCachedQuote(ticker.value);
    quote.value = q;
    currentPrice.value = q.price;
    if (q.name) companyName.value = q.name;
  } catch {}
}

async function loadFx() {
  try {
    const data = await api.get("/stocks/fx/ils-to-usd");
    ilsToUsd.value = data?.ilsToUsd ?? null;
  } catch {}
}

async function loadHistory() {
  chartLoading.value = true;
  try {
    const pointsMap = { "1d": 160, "5d": 160, "1mo": 160 };
    const points = pointsMap[selectedRange.value] ?? 160;
    history.value = await historyStore.fetchHistory(
      ticker.value,
      selectedRange.value,
      points,
    );
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("stockDetail.failedLoadChart"),
      detail: err.message,
      life: 3000,
    });
    history.value = [];
  } finally {
    chartLoading.value = false;
  }
}

// Dividend transactions for this position
const dividendTxs = computed(() =>
  transactions.value
    .filter((tx) => tx.type === "dividend")
    .sort((a, b) => new Date(b.date) - new Date(a.date)),
);
const totalDividends = computed(() =>
  dividendTxs.value.reduce((s, d) => s + (d.total || 0), 0),
);
const holdingLots = computed(() => {
  const openLots = [];
  const ordered = [...transactions.value].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  );

  for (const tx of ordered) {
    if (tx.type === "buy") {
      if (tx.shares > 0) openLots.push({ shares: tx.shares, date: tx.date });
    } else if (tx.type === "sell") {
      let remaining = tx.shares || 0;
      while (remaining > 0 && openLots.length) {
        const lot = openLots[0];
        const consumed = Math.min(lot.shares, remaining);
        lot.shares -= consumed;
        remaining -= consumed;
        if (lot.shares <= 0) openLots.shift();
      }
    } else if (tx.type === "dividend" && tx.drip && tx.shares > 0) {
      openLots.push({ shares: tx.shares, date: tx.date });
    }
  }

  return openLots;
});
const weightedHoldingMs = computed(() => {
  const lots = holdingLots.value;
  const totalShares = lots.reduce((sum, lot) => sum + lot.shares, 0);
  if (totalShares <= 0) return null;

  const nowMs = now.value.getTime();
  const weightedMs = lots.reduce((sum, lot) => {
    const lotMs = new Date(lot.date).getTime();
    if (!Number.isFinite(lotMs) || lotMs > nowMs) return sum;
    return sum + (nowMs - lotMs) * lot.shares;
  }, 0);

  return weightedMs / totalShares;
});
const holdingTimeLabel = computed(() =>
  weightedHoldingMs.value != null
    ? formatDurationMs(weightedHoldingMs.value)
    : "",
);

// Running weighted average per lot
const lots = computed(() => {
  let shares = 0;
  let totalCost = 0;
  return transactions.value.map((tx) => {
    if (tx.type === "buy") {
      totalCost += tx.shares * tx.price;
      shares += tx.shares;
    } else if (tx.type === "sell") {
      totalCost -= (totalCost / shares) * tx.shares;
      shares -= tx.shares;
    } else if (tx.type === "dividend" && tx.drip && tx.shares > 0) {
      totalCost += tx.shares * tx.price;
      shares += tx.shares;
    }
    // cash dividend: no position change
    const avgCost = shares > 0 ? totalCost / shares : 0;
    return { ...tx, runningShares: shares, runningAvg: avgCost };
  });
});

// Full summary including stored fees, display-only default fee estimates, realized tax,
// and estimated tax if the remaining shares were sold now.
const summary = computed(() => {
  if (!lots.value.length) return null;
  const last = lots.value[lots.value.length - 1];
  const shares = last.runningShares;
  const avgCost = last.runningAvg;
  const totalCost = shares * avgCost;

  // Fee rows keep their original currency for display. Net totals convert mixed-currency
  // fees into ticker currency so return math stays in one currency.
  let totalBuyFees = 0;
  let totalSellFees = 0;
  let totalTax = 0;
  let realizedGross = 0; // sell proceeds before fees/tax
  let realizedNet = 0; // sell proceeds after fees/tax
  const feeRows = [];

  for (const tx of transactions.value) {
    const feeAmount = effectiveFeeAmountOf(tx);
    const feeCurrency = feeCurrencyOf(tx);
    const feeInTickerCurrency = convertFeeToTickerCurrency(
      feeAmount,
      feeCurrency,
    );
    if (tx.type === "buy") {
      totalBuyFees += feeInTickerCurrency;
      addFeeRow(
        feeRows,
        "buy",
        feeAmount,
        feeCurrency,
        isDefaultFeeEstimate(tx),
      );
    } else {
      totalSellFees += feeInTickerCurrency;
      addFeeRow(
        feeRows,
        "sell",
        feeAmount,
        feeCurrency,
        isDefaultFeeEstimate(tx),
      );
      totalTax += tx.taxAmount || 0;
      realizedGross += tx.total || 0;
      realizedNet += tx.total - feeInTickerCurrency - (tx.taxAmount || 0);
    }
  }

  const totalFees = totalBuyFees + totalSellFees;
  const currentValue =
    currentPrice.value != null ? shares * currentPrice.value : null;

  // Gross P&L = current value - cost basis (ignores fees/tax)
  const grossPnl = currentValue != null ? currentValue - totalCost : null;
  const grossPnlPct =
    avgCost > 0 && currentPrice.value != null
      ? ((currentPrice.value - avgCost) / avgCost) * 100
      : null;

  // Estimated future sell tax if sold at current price
  const unrealizedGain = currentValue != null ? currentValue - totalCost : null;
  // Tax rate from a saved fee profile, falling back to the active default profile.
  const taxRate =
    transactions.value.find((t) => t.feeProfile?.capitalGainsTax)?.feeProfile
      ?.capitalGainsTax ||
    defaultFeeProfile()?.capitalGainsTax ||
    0;
  const estimatedTax =
    unrealizedGain != null && unrealizedGain > 0 && taxRate > 0
      ? Math.round(((unrealizedGain * taxRate) / 100) * 100) / 100
      : 0;

  // Net P&L = gross P&L - all fees paid - realized tax - estimated tax if sold now.
  const netPnl =
    grossPnl != null ? grossPnl - totalFees - totalTax - estimatedTax : null;
  const netPnlPct =
    totalCost > 0 && netPnl != null
      ? (netPnl / (totalCost + totalFees)) * 100
      : null;

  return {
    shares,
    avgCost,
    totalCost,
    currentValue,
    grossPnl,
    grossPnlPct,
    netPnl,
    netPnlPct,
    totalBuyFees,
    totalSellFees,
    totalFees,
    feeRows,
    totalTax,
    taxRate,
    estimatedTax,
    realizedGross,
    realizedNet,
  };
});

watch(
  summary,
  (s) => {
    if (s?.avgCost && !buySimTargetAvg.value) buySimTargetAvg.value = s.avgCost;
  },
  { immediate: true },
);

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDurationMs(value) {
  if (!Number.isFinite(value) || value < 0) return "";
  const totalDays = Math.floor(value / 86400000);
  const years = Math.floor(totalDays / 365);
  const months = Math.floor((totalDays % 365) / 30);
  const days = totalDays - years * 365 - months * 30;
  if (years > 0) return `${years}y${months > 0 ? ` ${months}m` : ""}`;
  if (months > 0) return `${months}m${days > 0 ? ` ${days}d` : ""}`;
  if (days > 0) return `${days}d`;
  return t("positionDetail.today");
}

function fmt(val) {
  return val >= 0 ? "+" : "";
}

function formatTaxPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0%";
  return `${num
    .toFixed(3)
    .replace(/(\.\d*?[1-9])0+$/u, "$1")
    .replace(/\.0+$/u, "")}%`;
}

function formatDividendCurrency(value) {
  if (value == null) return "—";
  const abs = Math.abs(value);
  const maxFractionDigits = abs > 0 && abs < 0.01 ? 6 : abs < 1 ? 4 : 2;
  const minimumFractionDigits = abs > 0 && abs < 0.01 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: tickerCurr.value,
    minimumFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

const tickerCurr = computed(() =>
  ticker.value.endsWith(".TA") ? "ILS" : "USD",
);
const currSymbol = computed(() => (tickerCurr.value === "ILS" ? "₪" : "$"));

function isAllowedFeeCurrency(profileCurrency, transactionCurrency) {
  if (transactionCurrency === "ILS") return true;
  if (profileCurrency === transactionCurrency) return true;
  return transactionCurrency === "USD" && profileCurrency === "ILS";
}

const matchingFeeProfiles = computed(() => {
  const currency = tickerCurr.value;
  return [...BUILTIN_FEE_PROFILES, ...feeStore.profiles].filter((p) =>
    isAllowedFeeCurrency(p.currency || "USD", currency),
  );
});

function defaultFeeProfile() {
  const profiles = matchingFeeProfiles.value;
  return (
    profiles.find((p) => p.isDefault) ||
    (profiles.length === 1 ? profiles[0] : null)
  );
}

function feeCurrencyForTransaction(profile) {
  return tickerCurr.value === "ILS" ? "ILS" : profile?.currency || tickerCurr.value;
}

function feeProfileLabel(profile) {
  return `${profile.name} · ${feeCurrencyForTransaction(profile)}`;
}

function feeProfileOf(tx) {
  return tx.feeProfile || (tx.feeAmount ? null : defaultFeeProfile());
}

function feeCurrencyOf(tx) {
  return feeCurrencyForTransaction(feeProfileOf(tx));
}

function isDefaultFeeEstimate(tx) {
  return !tx.feeProfile && !(tx.feeAmount > 0) && Boolean(defaultFeeProfile());
}

function effectiveFeeAmountOf(tx) {
  if (tx.feeAmount > 0) return tx.feeAmount;
  const profile = feeProfileOf(tx);
  if (!profile) return 0;
  const total = tx.total || (tx.shares || 0) * (tx.price || 0);
  const rule = tx.type === "buy" ? profile.buyFee : profile.sellFee;
  return calcFee(rule, total);
}

function convertFeeToTickerCurrency(amount, feeCurrency) {
  if (!amount || feeCurrency === tickerCurr.value) return amount || 0;
  if (
    feeCurrency === "ILS" &&
    tickerCurr.value === "USD" &&
    Number.isFinite(ilsToUsd.value) &&
    ilsToUsd.value > 0
  ) {
    return amount * ilsToUsd.value;
  }
  if (
    feeCurrency === "USD" &&
    tickerCurr.value === "ILS" &&
    Number.isFinite(ilsToUsd.value) &&
    ilsToUsd.value > 0
  ) {
    return amount / ilsToUsd.value;
  }
  return amount || 0;
}

function addFeeRow(rows, type, amount, currency, estimated = false) {
  if (!amount) return;
  const key = `${type}:${currency}:${estimated ? "default" : "saved"}`;
  const existing = rows.find((row) => row.key === key);
  if (existing) {
    existing.amount += amount;
    return;
  }
  rows.push({ key, type, amount, currency, estimated });
}

function netProceedsOf(tx) {
  const fee = convertFeeToTickerCurrency(
    effectiveFeeAmountOf(tx),
    feeCurrencyOf(tx),
  );
  return (tx.total || 0) - fee - (tx.taxAmount || 0);
}

function calcFee(rule, total) {
  if (!rule) return 0;
  const value = Number(rule.value) || 0;
  const minFee = Number(rule.minFee) || 0;
  let fee = rule.type === "percent" ? total * value : value;
  if (minFee && fee < minFee) fee = minFee;
  return Math.round(fee * 100) / 100;
}

const marketGroup = computed(() => {
  if (ticker.value.endsWith(".TA")) return "Israel";
  if (/-USD$/.test(ticker.value)) return "Crypto";
  return "US";
});
const marketMeta = computed(() => {
  const market = MARKET_HOURS_BY_GROUP[marketGroup.value];
  return market ? getMarketHoursState(market, now.value) : null;
});
const shekelValue = computed(() => {
  if (quote.value?.price == null) return null;
  if (marketGroup.value === "Israel" || marketGroup.value === "US") return null;
  if (!Number.isFinite(ilsToUsd.value) || ilsToUsd.value <= 0) return null;
  return quote.value.price / ilsToUsd.value;
});
const quoteChange = computed(() => ({
  amount: quote.value?.change ?? null,
  percent: quote.value?.changePercent ?? null,
}));
const normalizedDividendYield = computed(() => {
  const value = quote.value?.dividendYield;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value > 1 ? value / 100 : value;
});
const annualDividendRate = computed(() => {
  if (quote.value?.dividendRate > 0) return quote.value.dividendRate;
  if (normalizedDividendYield.value && quote.value?.price > 0)
    return normalizedDividendYield.value * quote.value.price;
  return null;
});
const annualDividendTotal = computed(() =>
  annualDividendRate.value != null && summary.value
    ? annualDividendRate.value * summary.value.shares
    : null,
);
const holdingYearFraction = computed(() =>
  weightedHoldingMs.value != null
    ? weightedHoldingMs.value / (365 * 86400000)
    : null,
);
const heldDividendTotal = computed(() =>
  annualDividendTotal.value != null && holdingYearFraction.value != null
    ? annualDividendTotal.value * holdingYearFraction.value
    : null,
);
const rangeChange = computed(() => {
  const rows = history.value.filter((row) => Number.isFinite(row?.close));
  if (rows.length < 2) return null;

  const firstClose = rows[0].close;
  const lastClose = rows[rows.length - 1].close;
  if (
    !Number.isFinite(firstClose) ||
    !Number.isFinite(lastClose) ||
    firstClose === 0
  )
    return null;

  const amount = lastClose - firstClose;
  return {
    amount,
    percent: (amount / firstClose) * 100,
  };
});
// For 1d, always use the API's changePercent (today vs previous close) — the
// chart history spans yesterday's bars during pre-market, so rangeChange would
// reflect the wrong day's move.
const displayedPriceChange = computed(() =>
  selectedRange.value === "1d"
    ? quoteChange.value
    : rangeChange.value || quoteChange.value,
);
const displayedPriceChangeLabel = computed(() =>
  selectedRange.value !== "1d" && rangeChange.value
    ? t("positionDetail.rangeLabel", {
        range: RANGE_LABELS[selectedRange.value] || selectedRange.value,
      })
    : t("positionDetail.today"),
);
const previousCloseLine = computed(() => quote.value?.previousClose ?? null);
const headerSubtitle = computed(() =>
  summary.value
    ? `${ticker.value} · ${t("positionDetail.transactionLots")}`
    : `${ticker.value} · ${t("positionDetail.marketOverview")}`,
);
const isWatched = computed(() => Boolean(watchedItem.value));
const watchlistNavIndex = computed(() =>
  watchlistNavTickers.value.indexOf(ticker.value),
);
const previousWatchlistTicker = computed(() => {
  const index = watchlistNavIndex.value;
  return index > 0 ? watchlistNavTickers.value[index - 1] : null;
});
const nextWatchlistTicker = computed(() => {
  const index = watchlistNavIndex.value;
  return index >= 0 && index < watchlistNavTickers.value.length - 1
    ? watchlistNavTickers.value[index + 1]
    : null;
});
const sessionMetaText = computed(() => {
  const meta = marketMeta.value;
  if (!meta?.closeLabel) return "";
  if (meta.key === "crypto") return t("positionDetail.trades247");
  return `${meta.isOpen ? t("positionDetail.closes") : t("positionDetail.afterHoursShort")}: ${meta.closeLabel}`;
});

function formatExtendedHoursTime(value, timezone) {
  if (!value) return "";
  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || undefined,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function calculateExtendedChange(price, change) {
  if (price == null) return { change: null, changePercent: null };
  const amount =
    change ?? (quote.value?.price != null ? price - quote.value.price : null);
  if (amount == null) return { change: null, changePercent: null };
  const previous = price - amount;
  const percent =
    Number.isFinite(previous) && previous !== 0
      ? (amount / previous) * 100
      : null;
  return { change: amount, changePercent: percent };
}

const extendedHours = computed(() => {
  if (!quote.value || marketGroup.value === "Crypto") return null;

  const source =
    quote.value.postMarketPrice != null
      ? {
          label: t("common.afterHours"),
          price: quote.value.postMarketPrice,
          change: quote.value.postMarketChange,
          changePercent: quote.value.postMarketChangePercent,
          time: quote.value.postMarketTime,
        }
      : quote.value.preMarketPrice != null
        ? {
            label: t("common.preMarket"),
            price: quote.value.preMarketPrice,
            change: quote.value.preMarketChange,
            changePercent: quote.value.preMarketChangePercent,
            time: quote.value.preMarketTime,
          }
        : quote.value.lastPostMarketPrice != null
          ? {
              label: t("common.afterHoursLastSeen"),
              price: quote.value.lastPostMarketPrice,
              change: quote.value.lastPostMarketChange,
              changePercent: quote.value.lastPostMarketChangePercent,
              time: quote.value.lastPostMarketTime,
            }
          : quote.value.lastPreMarketPrice != null
            ? {
                label: t("common.preMarketLastSeen"),
                price: quote.value.lastPreMarketPrice,
                change: quote.value.lastPreMarketChange,
                changePercent: quote.value.lastPreMarketChangePercent,
                time: quote.value.lastPreMarketTime,
              }
            : null;

  if (!source || source.price == null) return null;
  const derived = calculateExtendedChange(source.price, source.change);

  return {
    ...source,
    change: source.change ?? derived.change,
    changePercent: source.changePercent ?? derived.changePercent,
    shekelPrice:
      Number.isFinite(ilsToUsd.value) &&
      ilsToUsd.value > 0 &&
      marketGroup.value !== "Israel" &&
      marketGroup.value !== "US"
        ? source.price / ilsToUsd.value
        : null,
    timeLabel: formatExtendedHoursTime(source.time, marketMeta.value?.timezone),
  };
});
const extendedHoursChangeText = computed(() => {
  if (!extendedHours.value) return "";
  if (
    extendedHours.value.change == null &&
    extendedHours.value.changePercent == null
  )
    return "";
  return `${useTickerCurrency(extendedHours.value.change, ticker.value)} (${usePercent(extendedHours.value.changePercent)})`;
});
// Short plain-language explanations for the stock-data table metrics, rendered
// as an ⓘ tooltip next to each stat. Keyed to match the positionDetail.stat*
// message keys.
const STAT_INFO = computed(() => ({
  open: t("positionDetail.statOpenInfo"),
  dayHigh: t("positionDetail.statDayHighInfo"),
  dayLow: t("positionDetail.statDayLowInfo"),
  volume: t("positionDetail.statVolumeInfo"),
  mktCap: t("positionDetail.statMktCapInfo"),
  pe: t("positionDetail.statPeInfo"),
  week52High: t("positionDetail.stat52WHighInfo"),
  week52Low: t("positionDetail.stat52WLowInfo"),
  divYield: t("positionDetail.divYieldInfo"),
  divPerShare: t("positionDetail.divPerShareInfo"),
  heldDivTotal: t("positionDetail.heldDivTotalInfo"),
  avgHoldingTime: t("positionDetail.avgHoldingTimeInfo"),
}));

const extendedHoursStats = computed(() => {
  if (!extendedHours.value) return [];
  return [
    {
      label: `${extendedHours.value.label} Price`,
      value: useTickerCurrency(extendedHours.value.price, ticker.value),
    },
    {
      label: `${extendedHours.value.label} Change`,
      value: extendedHoursChangeText.value || "—",
      valueClass: gainLossClass(extendedHours.value.change),
    },
    {
      label: `${extendedHours.value.label} Trade`,
      value: extendedHours.value.timeLabel || "—",
    },
  ];
});

function sellSimulationPayload() {
  if (!summary.value) return null;
  const heldShares = summary.value.shares;
  if (!heldShares || heldShares <= 0) return null;
  const shares = Math.min(Number(simShares.value) || 0, heldShares);
  if (!shares || shares <= 0) return null;
  const value = Number(simValue.value) || 0;
  const price = Number(simPrice.value || (value > 0 ? value / shares : 0));
  if (!price || price <= 0) return null;
  return {
    ticker: ticker.value,
    type: "sell",
    feeProfileId: simFeeProfileId.value,
    shares,
    price,
    total: shares * price,
    avgCost: summary.value.avgCost,
    currency: tickerCurr.value,
  };
}

function syncSellValueFromPrice() {
  if (syncingSellInputs || !simShares.value) return;
  syncingSellInputs = true;
  const price = Number(simPrice.value) || 0;
  simValue.value = price > 0 ? price * simShares.value : null;
  syncingSellInputs = false;
}

function syncSellPriceFromValue() {
  if (syncingSellInputs || !simShares.value) return;
  syncingSellInputs = true;
  const value = Number(simValue.value) || 0;
  simPrice.value = value > 0 ? value / simShares.value : null;
  syncingSellInputs = false;
}

watch(simPrice, syncSellValueFromPrice);
watch(simValue, syncSellPriceFromValue);
watch(simShares, syncSellValueFromPrice);
watch(
  () => summary.value?.shares,
  (shares) => {
    if (!shares) return;
    if (!simShares.value || simShares.value > shares) simShares.value = shares;
    syncSellValueFromPrice();
  },
  { immediate: true },
);

async function refreshSellSimulationCosts() {
  const payload = sellSimulationPayload();
  const requestId = ++sellSimulationRequestId;
  if (!payload) {
    sellSimulationCosts.value = null;
    return;
  }
  try {
    const data = await api.post("/fee-profiles/simulate", payload);
    if (requestId === sellSimulationRequestId) {
      sellSimulationCosts.value = {
        ...data,
        key: JSON.stringify(payload),
      };
    }
  } catch {
    if (requestId === sellSimulationRequestId) sellSimulationCosts.value = null;
  }
}

watch(
  [
    simPrice,
    simShares,
    simFeeProfileId,
    ticker,
    tickerCurr,
    () => summary.value?.shares,
    () => summary.value?.avgCost,
  ],
  refreshSellSimulationCosts,
  { immediate: true },
);

const simulation = computed(() => {
  if (!summary.value) return null;
  const { shares: heldShares, avgCost, totalBuyFees } = summary.value;
  const shares = Math.min(Number(simShares.value) || 0, heldShares);
  if (!shares || shares <= 0) return null;
  const value = Number(simValue.value) || 0;
  const sellPrice = Number(simPrice.value || (value > 0 ? value / shares : 0));
  if (!sellPrice || sellPrice <= 0) return null;
  const grossProceeds = sellPrice * shares;
  const payload = sellSimulationPayload();
  const costs = sellSimulationCosts.value;
  if (!payload || !costs || costs.key !== JSON.stringify(payload)) return null;
  const sellFee = costs.feeAmount || 0;
  const sellFeeCurrency = costs.feeCurrency || tickerCurr.value;
  const sellFeeInTickerCurrency = costs.feeAmountForTotals || 0;
  const tax = costs.taxAmount || 0;
  const taxRate = costs.taxRate || 0;

  const netProceeds = grossProceeds - sellFeeInTickerCurrency - tax;
  const costBasis = avgCost * shares;
  const allocatedBuyFees = heldShares > 0 ? totalBuyFees * (shares / heldShares) : 0;
  // Net profit = net proceeds - proportional original cost - proportional buy fees already paid
  const netProfit = netProceeds - costBasis - allocatedBuyFees;
  const netProfitPct =
    costBasis + allocatedBuyFees > 0
      ? (netProfit / (costBasis + allocatedBuyFees)) * 100
      : 0;

  return {
    sellPrice,
    shares,
    grossProceeds,
    sellFee,
    sellFeeCurrency,
    sellFeeInTickerCurrency,
    tax,
    taxRate,
    netProceeds,
    netProfit,
    netProfitPct,
    profileName: costs.profileName || null,
  };
});

watch(
  () => feeStore.profiles,
  (profiles) => {
    const def =
      profiles.find((p) => p.isDefault)?._id || profiles[0]?._id || null;
    const selectableProfiles = matchingFeeProfiles.value;
    if (
      simFeeProfileId.value !== null &&
      !selectableProfiles.some((p) => p._id === simFeeProfileId.value)
    ) {
      simFeeProfileId.value = def;
    }
    if (
      buySimFeeProfileId.value !== null &&
      !selectableProfiles.some((p) => p._id === buySimFeeProfileId.value)
    ) {
      buySimFeeProfileId.value = def;
    }
  },
  { immediate: true },
);

function calcBuySimulation(price, shares) {
  if (!price || !shares || shares <= 0) return null;
  const cost = price * shares;

  const profile = matchingFeeProfiles.value.find(
    (p) => p._id === buySimFeeProfileId.value,
  );
  const buyFee = calcFee(profile?.buyFee, cost);
  const totalCost = cost + buyFee;

  const existingShares = summary.value?.shares ?? 0;
  const existingCost = summary.value?.totalCost ?? 0;
  const combinedShares = existingShares + shares;
  const combinedCost = existingCost + totalCost;
  const newAvgCost = combinedShares > 0 ? combinedCost / combinedShares : price;

  const rawBreakEven = combinedCost / combinedShares;
  const estimatedSellFee = calcFee(
    profile?.sellFee,
    rawBreakEven * combinedShares,
  );
  const breakEven = (combinedCost + estimatedSellFee) / combinedShares;

  return {
    price,
    shares,
    cost,
    buyFee,
    buyFeeInTickerCurrency: buyFee,
    totalCost,
    newAvgCost,
    breakEven,
    hasSellFee: estimatedSellFee > 0,
    profileName: profile?.name || null,
  };
}

const buySimulation = computed(() => {
  const price = buySimPrice.value;
  if (!price || price <= 0) return null;

  if (buySimMode.value === "shares") {
    return buySimShares.value > 0
      ? calcBuySimulation(price, buySimShares.value)
      : null;
  }

  if (buySimMode.value === "amount") {
    const budget = buySimAmount.value;
    if (!budget || budget <= 0) return null;
    const wholeShares = Math.floor(budget / price);
    if (wholeShares <= 0) return null;
    const result = calcBuySimulation(price, wholeShares);
    return result ? { ...result, leftover: budget - result.totalCost } : null;
  }

  if (buySimMode.value === "target") {
    const targetAvg = buySimTargetAvg.value;
    if (!targetAvg || targetAvg <= 0) return null;
    const existingShares = summary.value?.shares ?? 0;
    const existingCost = summary.value?.totalCost ?? 0;
    if (existingShares <= 0) return null;
    // Solve: (existingCost + shares * price) / (existingShares + shares) = targetAvg
    // => shares = (existingShares * targetAvg - existingCost) / (price - targetAvg)
    if (price >= targetAvg) return { targetImpossible: true, price, targetAvg };
    const neededShares =
      (existingShares * targetAvg - existingCost) / (price - targetAvg);
    if (!Number.isFinite(neededShares) || neededShares <= 0) return null;
    const wholeShares = Math.ceil(neededShares);
    return calcBuySimulation(price, wholeShares);
  }

  return null;
});

const selectedDelta = computed(() => {
  if (selectedChartPoints.value.length !== 2) return null;

  const [start, end] = selectedChartPoints.value;
  const startPrice = start?.close;
  const endPrice = end?.close;
  if (startPrice == null || endPrice == null) return null;

  const amount = endPrice - startPrice;
  const percent = startPrice ? (amount / startPrice) * 100 : null;
  const startDate = new Date(start.date);
  const endDate = new Date(end.date);
  const hours = Math.abs(endDate - startDate) / 36e5;

  return {
    amount,
    percent,
    startPrice,
    endPrice,
    startLabel: startDate.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    endLabel: endDate.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    spanLabel:
      hours >= 24 ? `${(hours / 24).toFixed(1)}d` : `${hours.toFixed(1)}h`,
  };
});

// Low → high of a set of bars, in chronological order so the sign reflects the
// actual move between the two extremes.
function lowHighDelta(rows) {
  const valid = rows.filter((d) => d?.close != null);
  if (valid.length < 2) return null;

  let lo = valid[0];
  let hi = valid[0];
  for (const d of valid) {
    if (d.close < lo.close) lo = d;
    if (d.close > hi.close) hi = d;
  }
  if (lo === hi) return null;

  const [start, end] =
    new Date(lo.date) <= new Date(hi.date) ? [lo, hi] : [hi, lo];
  const startPrice = start.close;
  const endPrice = end.close;
  const amount = endPrice - startPrice;
  const percent = startPrice ? (amount / startPrice) * 100 : null;
  const startDate = new Date(start.date);
  const endDate = new Date(end.date);
  const hours = Math.abs(endDate - startDate) / 36e5;

  return {
    amount,
    percent,
    startPrice,
    endPrice,
    startPoint: {
      date: start.date,
      close: start.close,
    },
    endPoint: {
      date: end.date,
      close: end.close,
    },
    startLabel: startDate.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    endLabel: endDate.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    spanLabel:
      hours >= 24 ? `${(hours / 24).toFixed(1)}d` : `${hours.toFixed(1)}h`,
  };
}

// Default measurement (low → high) across all loaded bars, incl. pre/after-hours.
const defaultDelta = computed(() => lowHighDelta(history.value));

// Same low → high measurement restricted to regular trading-hours bars.
const regularHoursDelta = computed(() =>
  lowHighDelta(
    history.value.filter((d) => isRegularSessionBar(d.date, ticker.value)),
  ),
);

// Single measure row: selection takes over; otherwise show the trading-hours
// low → high (falling back to the full range if no regular-session bars exist).
const measureDelta = computed(
  () => selectedDelta.value ?? regularHoursDelta.value ?? defaultDelta.value,
);

const measureLabel = computed(() => {
  if (selectedDelta.value) return t("positionDetail.selectedRange");
  if (!measureDelta.value) return t("positionDetail.lowToHigh");
  return measureDelta.value.amount < 0
    ? t("positionDetail.highToLow")
    : t("positionDetail.lowToHigh");
});

const measureMarkerPoints = computed(() => {
  if (
    selectedDelta.value ||
    !measureDelta.value?.startPoint ||
    !measureDelta.value?.endPoint
  )
    return [];

  const isDownMove = measureDelta.value.amount < 0;
  return [
    {
      ...measureDelta.value.startPoint,
      label: isDownMove ? "High" : "Low",
      tone: isDownMove ? "high" : "low",
    },
    {
      ...measureDelta.value.endPoint,
      label: isDownMove ? "Low" : "High",
      tone: isDownMove ? "low" : "high",
    },
  ];
});

const measureEndpointClasses = computed(() => {
  if (!measureDelta.value) return { start: "", end: "" };
  const isDownMove = measureDelta.value.amount < 0;
  return {
    start: isDownMove ? "measure-high" : "measure-low",
    end: isDownMove ? "measure-low" : "measure-high",
  };
});

function handleChartSelection(points) {
  selectedChartPoints.value = points;
}

function dismissChartSelectionHelp() {
  chartSelectionHelpDismissed.value = true;
  localStorage.setItem(CHART_SELECTION_HELP_KEY, "1");
}

function loadWatchlistNavContext() {
  try {
    const tickers = JSON.parse(
      sessionStorage.getItem(WATCHLIST_NAV_KEY) || "[]",
    );
    watchlistNavTickers.value = Array.isArray(tickers)
      ? tickers.map((value) => String(value).toUpperCase()).filter(Boolean)
      : [];
  } catch {
    watchlistNavTickers.value = [];
  }
}

function openWatchlistTicker(nextTicker) {
  if (!nextTicker) return;
  sessionStorage.setItem(WATCHLIST_TICKER_KEY, nextTicker);
  sessionStorage.setItem(WATCHLIST_RETURN_KEY, "1");
  router.push(`/position/${encodeURIComponent(nextTicker)}`);
}

function returnToWatchlist() {
  sessionStorage.setItem(WATCHLIST_TICKER_KEY, ticker.value);
  sessionStorage.setItem(WATCHLIST_RETURN_KEY, "1");
  router.go(-1);
}

async function fetchWatchlistItem() {
  try {
    const data = await api.get(
      `/watchlist/item/${encodeURIComponent(ticker.value)}`,
    );
    watchedItem.value = data?.item || null;
  } catch {
    watchedItem.value = null;
  }
}

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    now.value = new Date();
    fetchQuote();
  }, 60000);
}

// ── Momentum score ── disabled for now, see useMomentumScore.js ───────────────
// const momentumStore = useMomentumStore()
// const watchedItemList = computed(() => watchedItem.value ? [watchedItem.value] : [])
// useListMomentumScores(watchedItemList)
//
// const momentumScore = computed(() => {
//   void momentumStore.scores
//   return momentumStore.getScore(ticker.value)
// })
// const momentumSignal = computed(() => momentumScore.value != null ? signalFromScore(momentumScore.value) : null)

const extPctForBreakdown = computed(() => {
  const q = quote.value;
  if (!q) return null;
  return (
    q.preMarketChangePercent ??
    q.postMarketChangePercent ??
    q.lastPreMarketChangePercent ??
    q.lastPostMarketChangePercent ??
    null
  );
});
// const momentumBreakdown = computed(() => buildBreakdown({
//   dayPct: quote.value?.changePercent ?? null,
//   extPct: extPctForBreakdown.value,
//   hist: history.value,
//   price: quote.value?.price ?? null,
//   volume: quote.value?.volume ?? null,
//   avgVolume: quote.value?.avgVolume ?? null,
//   wave: 0,
// }))
const momentumBreakdown = computed(() => []);

async function toggleWatchlist() {
  if (watchedItem.value) {
    await watchlistStore.removeItem(watchedItem.value._id);
    watchedItem.value = null;
    toast.add({
      severity: "info",
      summary: t("stockDetail.removedFromWatchlist"),
      life: 2000,
    });
  } else {
    watchedItem.value = await watchlistStore.addItem(
      ticker.value,
      quote.value?.name,
    );
    toast.add({
      severity: "success",
      summary: t("stockDetail.addedToWatchlist"),
      life: 2000,
    });
  }
}
</script>

<template>
  <div class="position-detail" :class="{ 'panel-mode': panelMode }">
    <!--    <Button-->
    <!--        v-if="!panelMode && previousWatchlistTicker"-->
    <!--        v-tooltip.right="`Previous: ${previousWatchlistTicker}`"-->
    <!--        aria-label="Previous watchlist stock"-->
    <!--        class="watchlist-slide-handle watchlist-slide-handle-left"-->
    <!--        icon="pi pi-angle-left"-->
    <!--        @click="openWatchlistTicker(previousWatchlistTicker)"-->
    <!--    />-->
    <!--    <Button-->
    <!--        v-if="!panelMode && nextWatchlistTicker"-->
    <!--        v-tooltip.left="`Next: ${nextWatchlistTicker}`"-->
    <!--        aria-label="Next watchlist stock"-->
    <!--        class="watchlist-slide-handle watchlist-slide-handle-right"-->
    <!--        icon="pi pi-angle-right"-->
    <!--        @click="openWatchlistTicker(nextWatchlistTicker)"-->
    <!--    />-->
    <header class="page-header" data-tour="pos-header">
      <Button
        v-if="!panelMode"
        icon="pi pi-arrow-left"
        rounded
        text
        @click="returnToWatchlist"
      />
      <div class="header-info">
        <div class="header-title-row">
          <h1 class="gradient-title">{{ ticker }}</h1>
          <!-- Momentum badge disabled for now
          <span
              v-if="momentumSignal"
              :class="momentumSignal.cls"
              :title="momentumSignal.title"
              class="momentum-badge"
          >{{ momentumSignal.icon }}<span class="momentum-score">({{ momentumScore > 0 ? '+' : '' }}{{
              momentumScore
            }})</span></span>
          -->
        </div>
        <span class="text-muted">{{ companyName || headerSubtitle }}</span>
      </div>
      <div class="header-actions">
        <Button
          data-tour="pos-add-transaction"
          icon="pi pi-plus"
          rounded
          text
          @click="showModal = true"
        />
        <Button
          v-if="summary"
          v-tooltip.bottom="t('positionDetail.logDividend')"
          icon="pi pi-dollar"
          rounded
          text
          @click="showDividendModal = true"
        />
        <Button
          v-tooltip.bottom="t('positionDetail.setPriceAlert')"
          icon="pi pi-bell"
          rounded
          text
          @click="showAlertModal = true"
        />
        <Button
          v-tooltip.bottom="
            isWatched
              ? t('positionDetail.removeFromWatchlist')
              : t('positionDetail.addToWatchlist')
          "
          :icon="isWatched ? 'pi pi-trash' : 'pi pi-eye'"
          :outlined="isWatched"
          :severity="isWatched ? 'danger' : undefined"
          rounded
          text
          @click="toggleWatchlist"
        />
      </div>
    </header>

    <div v-if="loading" class="page-loader">
      <AppLoader />
    </div>

    <template v-else>
      <div v-if="quote" class="quote-summary" data-tour="pos-overview">
        <div class="price-row">
          <div class="price-main">
            <div class="current-price">
              {{ useTickerCurrency(quote.price, ticker) }}
              <span v-if="shekelValue != null">
                {{ useCurrency(shekelValue, "ILS") }}
              </span>
            </div>
            <p
              :class="gainLossClass(displayedPriceChange.amount)"
              class="price-change"
            >
              {{ useTickerCurrency(displayedPriceChange.amount, ticker) }} ({{
                usePercent(displayedPriceChange.percent)
              }})
              <span class="price-change-label">{{
                displayedPriceChangeLabel
              }}</span>
            </p>
            <div v-if="extendedHours" class="extended-row">
              <span class="extended-price">
                {{ useTickerCurrency(extendedHours.price, ticker) }}
                <span
                  v-if="extendedHours.shekelPrice != null"
                  class="extended-ils"
                >
                  {{ useCurrency(extendedHours.shekelPrice, "ILS") }}
                </span>
              </span>
              <span
                v-if="extendedHoursChangeText"
                :class="gainLossClass(extendedHours.change)"
                class="extended-change"
              >
                {{ extendedHoursChangeText }}
              </span>
            </div>
            <p v-if="extendedHours" class="hours-line text-muted">
              {{ extendedHours.label
              }}{{
                extendedHours.timeLabel ? `: ${extendedHours.timeLabel}` : ""
              }}
            </p>
            <p v-else-if="sessionMetaText" class="hours-line text-muted">
              {{ sessionMetaText }}
            </p>
          </div>
        </div>
      </div>
      <div v-else-if="loading" class="quote-summary">
        <div class="price-skeleton" />
      </div>

      <StockChart
        data-tour="pos-chart"
        :key="`${ticker}-${selectedRange}-${chartMode}`"
        :current-price="previousCloseLine"
        :data="history"
        :loading="chartLoading"
        :marker-points="measureMarkerPoints"
        :mode="chartMode"
        :persistent-range-selection="true"
        :range="selectedRange"
        :ticker="ticker"
        @selection-change="handleChartSelection"
      />

      <div class="chart-controls">
        <RangeBar
          v-model="selectedRange"
          class="page-range"
          data-tour="pos-range"
        >
          <template #append>
            <button
              class="chart-mode-btn"
              :class="{ active: chartMode === 'line' }"
              data-tour="pos-chart-line"
              :title="t('positionDetail.lineChart')"
              type="button"
              @click="chartMode = 'line'"
            >
              <i class="pi pi-chart-line" />
            </button>
            <button
              class="chart-mode-btn"
              :class="{ active: chartMode === 'candle' }"
              data-tour="pos-chart-candle"
              :title="t('positionDetail.candlestickChart')"
              type="button"
              @click="chartMode = 'candle'"
            >
              <i class="pi pi-chart-bar" />
            </button>
          </template>
        </RangeBar>
      </div>

      <div class="chart-measure">
        <div v-if="measureDelta" class="measure-summary">
          <span class="measure-tag text-muted">
            {{ measureLabel }}
          </span>
          <span :class="gainLossClass(measureDelta.amount)">
            <!--            {{ useTickerCurrency(measureDelta.amount, ticker) }}-->
            {{ usePercent(measureDelta.percent) }} /
          </span>
          <span class="text-muted">
            <span :class="measureEndpointClasses.start">
              {{ useTickerCurrency(measureDelta.startPrice, ticker) }}
            </span>
            <span> to </span>
            <span :class="measureEndpointClasses.end">
              {{ useTickerCurrency(measureDelta.endPrice, ticker) }}
            </span>
          </span>
        </div>
        <div v-else class="text-muted measure-hint">
          {{ t("positionDetail.dragMarkerHint") }}
        </div>
      </div>
      <div
        v-if="!chartSelectionHelpDismissed"
        class="chart-selection-help text-muted"
      >
        <button
          :aria-label="t('positionDetail.dismissChartHelp')"
          class="chart-selection-help-close"
          type="button"
          @click="dismissChartSelectionHelp"
        >
          <i class="pi pi-times" />
        </button>
        <p>{{ t("positionDetail.chartSelectionHelp") }}</p>
      </div>

      <!-- Signal breakdown -->
      <div v-if="quote && momentumBreakdown.length" class="signal-breakdown">
        <div class="signal-chips">
          <div
            v-for="chip in momentumBreakdown"
            :key="chip.label"
            :class="chip.cls"
            class="signal-chip"
          >
            <span class="chip-label">{{ chip.label }}</span>
            <span class="chip-value">{{ chip.value }}</span>
          </div>
        </div>
      </div>

      <!-- Price targets: active alerts with distance-to-target bars -->
      <div v-if="priceTargets.length" class="price-targets">
        <div class="targets-head">
          <h2 class="section-title">{{ t("priceTargets.title") }}</h2>
          <button
            class="targets-add"
            type="button"
            @click="showAlertModal = true"
          >
            <i class="pi pi-plus" />
          </button>
        </div>
        <div
          v-for="target in priceTargets"
          :key="target._id"
          class="target-row"
        >
          <div class="target-info">
            <span
              :class="target.condition === 'above' ? 'gain' : 'loss'"
              class="target-cond"
            >
              <i
                :class="
                  target.condition === 'above'
                    ? 'pi pi-arrow-up'
                    : 'pi pi-arrow-down'
                "
              />
              {{ useTickerCurrency(target.target, ticker) }}
            </span>
            <span v-if="target.hit" class="target-dist gain">{{
              t("priceTargets.hit")
            }}</span>
            <span
              v-else-if="target.distancePct != null"
              class="target-dist text-muted"
            >
              {{
                t("priceTargets.away", {
                  pct: `${target.distancePct >= 0 ? "+" : ""}${target.distancePct.toFixed(1)}%`,
                })
              }}
            </span>
          </div>
          <div class="target-bar">
            <div
              :class="[
                target.condition === 'above' ? 'fill-above' : 'fill-below',
                { 'fill-hit': target.hit },
              ]"
              :style="{ width: `${target.progress}%` }"
              class="target-fill"
            />
          </div>
          <span v-if="target.note" class="target-note text-muted">{{
            target.note
          }}</span>
        </div>
      </div>

      <template v-if="summary">
        <!-- Gross P&L card -->
        <div :class="gainLossClass(summary.grossPnl)" class="pnl-card">
          <div class="pnl-header">
            <!--          <span class="pnl-label text-muted">Gross P&L</span>-->
            <span class="pnl-label text-muted"
              >Avg {{ useTickerCurrency(summary.avgCost, ticker) }} →
              {{
                currentPrice != null
                  ? useTickerCurrency(currentPrice, ticker)
                  : "…"
              }}</span
            >
          </div>
          <div class="pnl-row">
            <span class="pnl-pct" :class="gainLossClass(summary.grossPnlPct)">
              {{
                summary.grossPnlPct != null
                  ? fmt(summary.grossPnlPct) +
                    summary.grossPnlPct.toFixed(2) +
                    "%"
                  : "—"
              }}
            </span>
            <span :class="gainLossClass(summary.grossPnl)" class="pnl-value">
              {{
                summary.grossPnl != null
                  ? fmt(summary.grossPnl) +
                    useTickerCurrency(summary.grossPnl, ticker)
                  : "—"
              }}
            </span>
          </div>
        </div>

        <!-- Net P&L card (after all fees + tax) -->
        <div
          v-if="
            summary.totalFees > 0 ||
            summary.totalTax > 0 ||
            summary.estimatedTax > 0
          "
          :class="gainLossClass(summary.netPnl)"
          class="pnl-card net-card"
        >
          <div class="pnl-header">
            <span class="pnl-label text-muted"
              >{{ t("positionDetail.netPnl") }}
              <span class="after-badge">{{
                t("positionDetail.afterFeesTax")
              }}</span></span
            >
            <span :class="gainLossClass(summary.netPnl)" class="pnl-label">
              {{
                summary.netPnl != null
                  ? fmt(summary.netPnl) +
                    useTickerCurrency(summary.netPnl, ticker)
                  : "—"
              }}
            </span>
          </div>
          <div class="fee-breakdown">
            <div v-for="row in summary.feeRows" :key="row.key" class="fee-row">
              <span class="text-muted"
                >{{
                  row.type === "buy"
                    ? t("positionDetail.buyFeesLabel")
                    : t("positionDetail.sellFeesLabel")
                }}
                {{
                  row.estimated
                    ? t("positionDetail.default")
                    : t("positionDetail.paid")
                }}</span
              >
              <span class="loss"
                >-{{ useCurrency(row.amount, row.currency) }}</span
              >
            </div>
            <div v-if="summary.totalTax > 0" class="fee-row">
              <span class="text-muted">{{
                t("positionDetail.capitalGainsTaxPaid")
              }}</span>
              <span class="loss"
                >-{{ useTickerCurrency(summary.totalTax, ticker) }}</span
              >
            </div>
            <div v-if="summary.estimatedTax > 0" class="fee-row est-row">
              <span class="text-muted">{{
                t("positionDetail.estTaxIfSoldNow", {
                  rate: formatTaxPercent(summary.taxRate),
                })
              }}</span>
              <span class="loss"
                >-{{ useTickerCurrency(summary.estimatedTax, ticker) }}</span
              >
            </div>
          </div>
          <div v-if="summary.netPnlPct != null" class="fee-row net-return-row">
            <span class="text-muted net-return-label">{{
              t("positionDetail.netReturn")
            }}</span>
            <span :class="gainLossClass(summary.netPnlPct)" class="net-pct">
              {{ fmt(summary.netPnlPct) }}{{ summary.netPnlPct.toFixed(2) }}%
            </span>
          </div>
        </div>

        <!-- Stats grid -->
        <div class="stats-row">
          <div class="stat-item">
            <span class="text-muted">{{ t("positionDetail.sharesHeld") }}</span>
            <span>{{ summary.shares.toFixed(4).replace(/\.?0+$/, "") }}</span>
          </div>
          <div class="stat-item">
            <span class="text-muted">{{ t("positionDetail.avgCost") }}</span>
            <span>{{ useTickerCurrency(summary.avgCost, ticker) }}</span>
          </div>
          <div class="stat-item">
            <span class="text-muted">{{
              t("positionDetail.totalInvested")
            }}</span>
            <span>{{ useTickerCurrency(summary.totalCost, ticker) }}</span>
          </div>
          <div class="stat-item">
            <span class="text-muted">{{
              t("positionDetail.currentValue")
            }}</span>
            <span>{{
              summary.currentValue != null
                ? useTickerCurrency(summary.currentValue, ticker)
                : "…"
            }}</span>
          </div>
        </div>
      </template>

      <div v-if="quote" class="stats-grid">
        <div
          v-for="row in extendedHoursStats"
          :key="row.label"
          class="stat stat-extended"
        >
          <span class="text-muted">{{ row.label }}</span>
          <span :class="row.valueClass">{{ row.value }}</span>
        </div>
        <div class="stat">
          <span class="text-muted stat-label-info"
            >{{ t("positionDetail.statOpen") }}
            <i
              v-tooltip.focus.top="STAT_INFO.open"
              class="pi pi-info-circle info-icon"
              tabindex="0"
          /></span>
          <span>{{ useTickerCurrency(quote.open, ticker) }}</span>
        </div>
        <div class="stat">
          <span class="text-muted stat-label-info"
            >{{ t("positionDetail.statDayHigh") }}
            <i
              v-tooltip.focus.top="STAT_INFO.dayHigh"
              class="pi pi-info-circle info-icon"
              tabindex="0"
          /></span>
          <span>{{ useTickerCurrency(quote.dayHigh, ticker) }}</span>
        </div>
        <div class="stat">
          <span class="text-muted stat-label-info"
            >{{ t("positionDetail.statDayLow") }}
            <i
              v-tooltip.focus.top="STAT_INFO.dayLow"
              class="pi pi-info-circle info-icon"
              tabindex="0"
          /></span>
          <span>{{ useTickerCurrency(quote.dayLow, ticker) }}</span>
        </div>
        <div class="stat">
          <span class="text-muted stat-label-info"
            >{{ t("positionDetail.statVolume") }}
            <i
              v-tooltip.focus.top="STAT_INFO.volume"
              class="pi pi-info-circle info-icon"
              tabindex="0"
          /></span>
          <span>{{ useLargeNumber(quote.volume, ticker) }}</span>
        </div>
        <div class="stat">
          <span class="text-muted stat-label-info"
            >{{ t("positionDetail.statMktCap") }}
            <i
              v-tooltip.focus.top="STAT_INFO.mktCap"
              class="pi pi-info-circle info-icon"
              tabindex="0"
          /></span>
          <span>{{ useLargeNumber(quote.marketCap, ticker) }}</span>
        </div>
        <div class="stat">
          <span class="text-muted stat-label-info"
            >{{ t("positionDetail.statPe") }}
            <i
              v-tooltip.focus.top="STAT_INFO.pe"
              class="pi pi-info-circle info-icon"
              tabindex="0"
          /></span>
          <span>{{ quote.pe?.toFixed(2) || "—" }}</span>
        </div>
        <div class="stat">
          <span class="text-muted stat-label-info"
            >{{ t("positionDetail.stat52WHigh") }}
            <i
              v-tooltip.focus.top="STAT_INFO.week52High"
              class="pi pi-info-circle info-icon"
              tabindex="0"
          /></span>
          <span>{{ useTickerCurrency(quote.week52High, ticker) }}</span>
        </div>
        <div class="stat">
          <span class="text-muted stat-label-info"
            >{{ t("positionDetail.stat52WLow") }}
            <i
              v-tooltip.focus.top="STAT_INFO.week52Low"
              class="pi pi-info-circle info-icon"
              tabindex="0"
          /></span>
          <span>{{ useTickerCurrency(quote.week52Low, ticker) }}</span>
        </div>
        <div v-if="normalizedDividendYield" class="stat">
          <span class="text-muted stat-label-info"
            >{{ t("positionDetail.divYield") }}
            <i
              v-tooltip.focus.top="STAT_INFO.divYield"
              class="pi pi-info-circle info-icon"
              tabindex="0"
          /></span>
          <span class="div-yield-val"
            >{{
              (normalizedDividendYield * 100).toFixed(3).replace(/\.?0+$/, "")
            }}%</span
          >
        </div>
        <div v-if="annualDividendRate" class="stat">
          <span class="text-muted stat-label-info"
            >{{ t("positionDetail.divPerShare") }}
            <i
              v-tooltip.focus.top="STAT_INFO.divPerShare"
              class="pi pi-info-circle info-icon"
              tabindex="0"
          /></span>
          <span>{{ formatDividendCurrency(annualDividendRate) }}</span>
        </div>
        <div v-if="annualDividendRate && summary?.taxRate" class="stat">
          <span class="text-muted">{{
            t("positionDetail.divAfterTax", {
              rate: formatTaxPercent(summary.taxRate),
            })
          }}</span>
          <span class="div-yield-val">{{
            formatDividendCurrency(
              annualDividendRate * (1 - summary.taxRate / 100),
            )
          }}</span>
        </div>
        <div v-if="heldDividendTotal != null" class="stat">
          <span class="text-muted stat-label-info"
            >{{ t("positionDetail.heldDivTotal") }}
            <i
              v-tooltip.focus.top="STAT_INFO.heldDivTotal"
              class="pi pi-info-circle info-icon"
              tabindex="0"
          /></span>
          <span class="div-yield-val">{{
            formatDividendCurrency(heldDividendTotal)
          }}</span>
        </div>
        <div v-if="summary && holdingTimeLabel" class="stat">
          <span class="text-muted stat-label-info"
            >{{ t("positionDetail.avgHoldingTime") }}
            <i
              v-tooltip.focus.top="STAT_INFO.avgHoldingTime"
              class="pi pi-info-circle info-icon"
              tabindex="0"
          /></span>
          <span>{{ holdingTimeLabel }}</span>
        </div>
        <div v-if="heldDividendTotal != null && summary?.taxRate" class="stat">
          <span class="text-muted">{{
            t("positionDetail.heldDivAfterTax")
          }}</span>
          <span class="div-yield-val">{{
            formatDividendCurrency(
              heldDividendTotal * (1 - summary.taxRate / 100),
            )
          }}</span>
        </div>
      </div>

      <div v-if="lots.length" class="lots-list">
        <h2 class="section-title">{{ t("positionDetail.lots") }}</h2>
        <div v-for="lot in lots" :key="lot._id" class="lot-row">
          <div class="lot-left">
            <div class="lot-top">
              <Tag
                :severity="lot.type === 'buy' ? 'success' : 'danger'"
                :value="lot.type.toUpperCase()"
                class="lot-tag"
              />
              <span class="lot-date text-muted">{{
                formatDate(lot.date)
              }}</span>
            </div>
            <div class="lot-detail">
              {{ lot.shares }} {{ t("common.shares") }} @
              {{ useTickerCurrency(lot.price, ticker) }}
            </div>
            <!-- Buy fee -->
            <div
              v-if="lot.type === 'buy' && effectiveFeeAmountOf(lot)"
              class="lot-extra loss"
            >
              <i class="pi pi-percentage" />
              {{ t("positionDetail.buyFeeColon") }}:
              {{ useCurrency(effectiveFeeAmountOf(lot), feeCurrencyOf(lot)) }}
              <span class="text-muted">
                ·
                {{
                  feeProfileOf(lot)?.name || t("positionDetail.defaultProfile")
                }}</span
              >
            </div>
            <!-- Sell fee -->
            <div
              v-if="lot.type === 'sell' && effectiveFeeAmountOf(lot)"
              class="lot-extra loss"
            >
              <i class="pi pi-percentage" />
              {{ t("positionDetail.sellFeeColon") }}:
              {{ useCurrency(effectiveFeeAmountOf(lot), feeCurrencyOf(lot)) }}
              <span class="text-muted">
                ·
                {{
                  feeProfileOf(lot)?.name || t("positionDetail.defaultProfile")
                }}</span
              >
            </div>
            <!-- Tax -->
            <div v-if="lot.taxAmount" class="lot-extra loss">
              <i class="pi pi-building-columns" />
              {{
                t("positionDetail.taxColon", {
                  rate: formatTaxPercent(lot.feeProfile?.capitalGainsTax),
                })
              }}:
              {{ useTickerCurrency(lot.taxAmount, ticker) }}
            </div>
            <!-- Net proceeds -->
            <div v-if="lot.type === 'sell'" class="lot-extra gain">
              <i class="pi pi-wallet" />
              {{ t("positionDetail.netProceedsColon") }}:
              {{ useTickerCurrency(netProceedsOf(lot), ticker) }}
            </div>
            <div v-if="lot.notes" class="lot-notes text-muted">
              {{ lot.notes }}
            </div>
          </div>
          <div class="lot-right">
            <span class="lot-total">{{
              useTickerCurrency(lot.total, ticker)
            }}</span>
            <span class="lot-avg text-muted"
              >{{ t("positionDetail.avgArrow") }}
              {{ useTickerCurrency(lot.runningAvg, ticker) }}</span
            >
            <span class="lot-shares text-muted"
              >{{ lot.runningShares.toFixed(2) }}
              {{ t("positionDetail.heldSuffix") }}</span
            >
            <Button
              class="lot-edit-btn"
              icon="pi pi-pencil"
              rounded
              size="small"
              text
              @click.stop="editingTx = lot"
            />
          </div>
        </div>
      </div>

      <!-- Trade Simulator -->
      <div class="sim-wrap">
        <div class="sim-head">
          <span class="sim-title">
            <i class="pi pi-calculator" />
            {{ t("common.buy") }} / {{ t("common.sell") }} Simulator
          </span>
          <div class="sim-head-actions">
            <div v-if="showSimulator" class="sim-tabs" role="tablist">
              <button
                :class="{ active: simulatorTab === 'buy' }"
                class="sim-tab"
                type="button"
                @click="simulatorTab = 'buy'"
              >
                {{ t("common.buy") }}
              </button>
              <button
                :class="{ active: simulatorTab === 'sell' }"
                :disabled="!summary"
                class="sim-tab"
                type="button"
                @click="simulatorTab = 'sell'"
              >
                {{ t("common.sell") }}
              </button>
            </div>
            <button
              :aria-expanded="showSimulator"
              class="sim-collapse-btn"
              type="button"
              @click="showSimulator = !showSimulator"
            >
              <i :class="showSimulator ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" />
            </button>
          </div>
        </div>

        <div v-if="showSimulator && simulatorTab === 'buy'" class="sim-body">
          <SelectButton
            v-model="buySimMode"
            :options="BUY_SIM_MODES"
            class="sim-mode-bar"
            option-label="label"
            option-value="value"
          />

          <div class="sim-inputs">
            <div class="sim-field">
              <label>{{ t("positionDetail.buyPricePerShare") }}</label>
              <InputNumber
                v-model="buySimPrice"
                :currency="tickerCurr"
                :max-fraction-digits="4"
                :min="0.001"
                fluid
                mode="currency"
              />
            </div>

            <!-- Mode: shares -->
            <div v-if="buySimMode === 'shares'" class="sim-field">
              <label>{{ t("positionDetail.sharesToBuy") }}</label>
              <InputNumber
                v-model="buySimShares"
                :max-fraction-digits="4"
                :min="0.0001"
                fluid
                placeholder="0"
              />
            </div>

            <!-- Mode: amount -->
            <div v-if="buySimMode === 'amount'" class="sim-field">
              <label>{{ t("positionDetail.budgetTotal") }}</label>
              <InputNumber
                v-model="buySimAmount"
                :currency="tickerCurr"
                :max-fraction-digits="0"
                :min="0"
                fluid
                mode="currency"
              />
            </div>

            <!-- Mode: target avg -->
            <div v-if="buySimMode === 'target'" class="sim-field">
              <label>{{ t("positionDetail.targetAverageCost") }}</label>
              <InputNumber
                v-model="buySimTargetAvg"
                :currency="tickerCurr"
                :max-fraction-digits="0"
                :min="1"
                fluid
                mode="currency"
              />
            </div>

            <div class="sim-field">
              <label>{{ t("positionDetail.feeProfile") }}</label>
              <Select
                v-model="buySimFeeProfileId"
                :options="[
                  { label: t('positionDetail.noFeeProfile'), value: null },
                  ...matchingFeeProfiles.map((p) => ({
                    label: feeProfileLabel(p),
                    value: p._id,
                  })),
                ]"
                fluid
                option-label="label"
                option-value="value"
              />
            </div>
          </div>

          <div class="sim-results">
            <template v-if="buySimulation?.targetImpossible">
              <span class="sim-placeholder loss">{{
                t("positionDetail.targetImpossible", {
                  price: useTickerCurrency(buySimulation.price, ticker),
                  target: useTickerCurrency(buySimulation.targetAvg, ticker),
                })
              }}</span>
            </template>
            <template v-else-if="buySimulation">
              <!-- Amount mode: show shares recommendation first -->
              <div v-if="buySimMode === 'amount'" class="sim-row sim-highlight">
                <span class="text-muted">{{
                  t("positionDetail.sharesToBuy")
                }}</span>
                <span class="sim-net">{{ buySimulation.shares }}</span>
              </div>
              <!-- Target mode: show shares recommendation first -->
              <div v-if="buySimMode === 'target'" class="sim-row sim-highlight">
                <span class="text-muted">{{
                  t("positionDetail.sharesToBuy")
                }}</span>
                <span class="sim-net">{{ buySimulation.shares }}</span>
              </div>
              <div class="sim-row">
                <span class="text-muted">{{
                  t("positionDetail.sharesCost")
                }}</span>
                <span>{{ currSymbol }}{{ buySimulation.cost.toFixed(2) }}</span>
              </div>
              <div v-if="buySimulation.buyFee > 0" class="sim-row">
                <span class="text-muted"
                  >{{ t("positionDetail.buyFeeLabel")
                  }}{{
                    buySimulation.profileName
                      ? ` · ${buySimulation.profileName}`
                      : ""
                  }}</span
                >
                <span class="loss"
                  >+{{
                    useCurrency(
                      buySimulation.buyFee,
                      buySimulation.buyFeeCurrency,
                    )
                  }}</span
                >
              </div>
              <div class="sim-row sim-divider">
                <span>{{ t("positionDetail.totalOutlay") }}</span>
                <span class="sim-net"
                  >{{ currSymbol
                  }}{{ buySimulation.totalCost.toFixed(2) }}</span
                >
              </div>
              <div
                v-if="buySimMode === 'amount' && buySimulation.leftover != null"
                class="sim-row"
              >
                <span class="text-muted">{{
                  t("positionDetail.leftoverCash")
                }}</span>
                <span
                  >{{ currSymbol }}{{ buySimulation.leftover.toFixed(2) }}</span
                >
              </div>
              <div class="sim-row">
                <span class="text-muted">{{
                  t("positionDetail.newAvgCost")
                }}</span>
                <span>{{
                  useTickerCurrency(buySimulation.newAvgCost, ticker)
                }}</span>
              </div>
              <div class="sim-row">
                <span class="text-muted">{{
                  t("positionDetail.breakEvenPrice")
                }}</span>
                <span>{{
                  useTickerCurrency(buySimulation.breakEven, ticker)
                }}</span>
              </div>
            </template>
            <span v-else class="sim-placeholder text-muted">
              <template v-if="buySimMode === 'shares'">{{
                t("positionDetail.enterPriceShares")
              }}</template>
              <template v-else-if="buySimMode === 'amount'">{{
                t("positionDetail.enterPriceBudget")
              }}</template>
              <template v-else>{{
                t("positionDetail.enterPriceTarget")
              }}</template>
            </span>
          </div>
        </div>
        <div v-if="showSimulator && simulatorTab === 'sell' && summary" class="sim-body">
          <div class="sim-inputs">
            <div class="sim-field">
              <label>{{ t("positionDetail.sellPricePerShare") }}</label>
              <InputNumber
                v-model="simPrice"
                :currency="tickerCurr"
                :max-fraction-digits="4"
                :min="0.001"
                fluid
                mode="currency"
              />
            </div>
            <div class="sim-field">
              <label>{{ t("positionDetail.sellValue") }}</label>
              <InputNumber
                v-model="simValue"
                :currency="tickerCurr"
                :max-fraction-digits="2"
                :min="0.01"
                fluid
                mode="currency"
              />
            </div>
            <div class="sim-field">
              <label>{{ t("positionDetail.sharesToSell") }}</label>
              <InputNumber
                v-model="simShares"
                :max="summary.shares"
                :max-fraction-digits="4"
                :min="0.0001"
                fluid
                placeholder="0"
              />
            </div>
            <div class="sim-field">
              <label>{{ t("positionDetail.feeProfile") }}</label>
              <Select
                v-model="simFeeProfileId"
                :options="[
                  { label: t('positionDetail.noFeeProfile'), value: null },
                  ...matchingFeeProfiles.map((p) => ({
                    label: feeProfileLabel(p),
                    value: p._id,
                  })),
                ]"
                fluid
                option-label="label"
                option-value="value"
              />
            </div>
          </div>

          <div class="sim-results">
            <template v-if="simulation">
              <div class="sim-row">
                <span class="text-muted">{{
                  t("transactionModal.grossProceeds")
                }}</span>
                <span
                  >{{ currSymbol
                  }}{{ simulation.grossProceeds.toFixed(2) }}</span
                >
              </div>
              <div v-if="simulation.sellFee > 0" class="sim-row">
                <span class="text-muted"
                  >{{ t("positionDetail.sellFeeLabel")
                  }}{{
                    simulation.profileName ? ` · ${simulation.profileName}` : ""
                  }}</span
                >
                <span class="loss"
                  >-{{
                    useCurrency(simulation.sellFee, simulation.sellFeeCurrency)
                  }}</span
                >
              </div>
              <div v-if="simulation.tax > 0" class="sim-row">
                <span class="text-muted">{{
                  t("positionDetail.capitalGainsTaxPct", {
                    rate: formatTaxPercent(simulation.taxRate),
                  })
                }}</span>
                <span class="loss"
                  >-{{ currSymbol }}{{ simulation.tax.toFixed(2) }}</span
                >
              </div>
              <div class="sim-row sim-divider">
                <span>{{ t("transactionModal.netProceeds") }}</span>
                <span class="sim-net"
                  >{{ currSymbol }}{{ simulation.netProceeds.toFixed(2) }}</span
                >
              </div>
              <div
                :class="gainLossClass(simulation.netProfit)"
                class="sim-row sim-profit"
              >
                <span>{{ t("transactionModal.netProfitLoss") }}</span>
                <div class="sim-profit-right">
                  <span class="sim-profit-pct"
                    >{{ fmt(simulation.netProfitPct)
                    }}{{ simulation.netProfitPct.toFixed(2) }}%</span
                  >
                  <span
                    >{{ fmt(simulation.netProfit) }}{{ currSymbol
                    }}{{ Math.abs(simulation.netProfit).toFixed(2) }}</span
                  >
                </div>
              </div>
            </template>
            <span v-else class="sim-placeholder text-muted">{{
              t("positionDetail.enterSellPrice")
            }}</span>
          </div>
        </div>
      </div>

      <!-- Position journal: investment thesis notes -->
      <div v-if="summary" class="sim-wrap">
        <button class="sim-toggle" @click="showJournal = !showJournal">
          <i class="pi pi-book" />
          {{ t("journal.title") }}
          <span v-if="journalSavedNotes" class="journal-has-notes" />
          <i
            :class="showJournal ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
            class="sim-chevron"
          />
        </button>

        <div v-if="showJournal" class="sim-body">
          <textarea
            v-model="journalNotes"
            :placeholder="t('journal.placeholder')"
            class="journal-textarea"
            rows="5"
          />
          <Button
            :disabled="!journalDirty"
            :label="t('journal.save')"
            :loading="journalSaving"
            fluid
            size="small"
            @click="saveJournal"
          />
        </div>
      </div>

      <!-- News-driven ticker insights (stockfolio-insights microservice) -->
      <template v-if="auth.canUsePremiumFeatures">
        <AnalystResearchCard :current-price="quote?.price ?? null" :ticker="ticker" />
        <TickerInsightCard :ticker="ticker" />
        <TickerRelationGraph :ticker="ticker" />
      </template>

      <!-- Dividend summary -->
      <div v-if="dividendTxs.length" class="dividends-section">
        <div class="dividends-header">
          <h2 class="section-title">{{ t("positionDetail.dividends") }}</h2>
          <div class="dividends-summary">
            <span v-if="holdingTimeLabel" class="text-muted">{{
              t("positionDetail.avgHeld", { duration: holdingTimeLabel })
            }}</span>
            <span class="div-total gain"
              >{{ t("positionDetail.total") }}
              {{ useTickerCurrency(totalDividends, ticker) }}</span
            >
          </div>
        </div>
        <div v-for="d in dividendTxs" :key="d._id" class="lot-row">
          <div class="lot-left">
            <div class="lot-top">
              <span class="div-badge">DIV</span>
              <span class="lot-date text-muted">{{ formatDate(d.date) }}</span>
              <span v-if="d.drip" class="drip-tag">DRIP</span>
            </div>
            <div class="lot-detail">
              {{ useTickerCurrency(d.price, ticker) }}
              {{ t("positionDetail.perShare") }}
              <template v-if="d.drip && d.shares">
                · +{{ d.shares }} {{ t("common.shares") }}</template
              >
            </div>
            <div v-if="d.notes" class="lot-notes text-muted">{{ d.notes }}</div>
          </div>
          <div class="lot-right">
            <span class="lot-total gain"
              >+{{ useTickerCurrency(d.total, ticker) }}</span
            >
            <Button
              class="lot-edit-btn"
              icon="pi pi-pencil"
              rounded
              size="small"
              text
              @click.stop="editingTx = d"
            />
          </div>
        </div>
      </div>

      <!--      <div v-if="!lots.length" class="empty">-->
      <!--        <i class="pi pi-list"/>-->
      <!--        <p class="text-muted">{{ t('positionDetail.noTransactionsYet') }}</p>-->
      <!--        <Button :label="t('positionDetail.addTransaction')" @click="showModal = true"/>-->
      <!--      </div>-->

    </template>

    <AddTransactionModal
      v-model:visible="showModal"
      :default-ticker="ticker"
      :default-price="currentPrice"
      :max-shares="summary?.shares ?? null"
      :avg-cost="summary?.avgCost ?? null"
      :total-cost="summary?.totalCost ?? null"
      :total-buy-fees="summary?.totalBuyFees ?? 0"
      @hide="fetchLots"
    />

    <AlertModal
      v-model:visible="showAlertModal"
      :current-price="quote?.price"
      :ticker="ticker"
    />

    <DividendModal
      v-model:visible="showDividendModal"
      :current-price="currentPrice"
      :default-ticker="ticker"
      :position-shares="summary?.shares ?? null"
      @saved="fetchLots"
    />

    <EditTransactionModal
      :transaction="editingTx"
      :visible="!!editingTx"
      @saved="fetchLots"
      @update:visible="
        (v) => {
          if (!v) editingTx = null;
        }
      "
    />
  </div>
</template>

<style scoped>
.position-detail {
  padding: 0.5rem 1rem 2rem;
}

.position-detail.panel-mode {
  padding: 0.5rem 0.75rem 2rem;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.header-info {
  flex: 1;
  min-width: 0;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.momentum-badge {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 5px;
  flex-shrink: 0;
  line-height: 1;
}

.momentum-score {
  font-size: 0.56rem;
  font-weight: 600;
  opacity: 0.8;
}

.sig-max-bull {
  background: color-mix(in srgb, var(--green) 28%, transparent);
  color: var(--green);
  box-shadow: 0 0 8px color-mix(in srgb, var(--green) 50%, transparent);
}

.sig-strong-bull {
  background: color-mix(in srgb, var(--green) 18%, transparent);
  color: var(--green);
}

.sig-bull {
  background: color-mix(in srgb, var(--green) 10%, transparent);
  color: var(--green);
}

.sig-max-bear {
  background: color-mix(in srgb, var(--red) 28%, transparent);
  color: var(--red);
  box-shadow: 0 0 8px color-mix(in srgb, var(--red) 50%, transparent);
}

.sig-strong-bear {
  background: color-mix(in srgb, var(--red) 18%, transparent);
  color: var(--red);
}

.sig-bear {
  background: color-mix(in srgb, var(--red) 10%, transparent);
  color: var(--red);
}

.sig-neutral {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
}

.watchlist-slide-handle {
  position: fixed;
  top: 50%;
  z-index: 20;
  width: 2.75rem;
  height: 2.75rem;
  transform: translateY(-50%);
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: #fff;
}

.watchlist-slide-handle:enabled:hover,
.watchlist-slide-handle:enabled:focus {
  background: transparent;
  color: #fff;
}

.watchlist-slide-handle-left {
  left: 0;
}

.watchlist-slide-handle-right {
  right: 0;
}

@media (min-width: 768px) {
  .watchlist-slide-handle-left {
    left: 0.35rem;
  }

  .watchlist-slide-handle-right {
    right: 0.35rem;
  }
}

.header-info h1 {
  font-size: 1.3rem;
  line-height: 1;
}

.header-info span {
  font-size: 0.82rem;
}

.quote-summary {
  margin-bottom: 1rem;
}

.price-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.price-main {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
}

.current-price {
  font-size: 2.2rem;
  font-weight: 700;
  display: flex;
  justify-content: space-between;
  width: 100%;
  flex-wrap: wrap;
}

.price-change {
  font-size: 1rem;
}

.price-change-label {
  margin-left: 0.35rem;
  color: var(--text-secondary);
  font-size: 0.74rem;
  font-weight: 600;
}

.price-ils {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  padding-top: 0.35rem;
}

.extended-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.extended-price {
  font-size: 1.65rem;
  font-weight: 700;
  color: var(--text-primary);
}

.extended-ils {
  margin-left: 0.45rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.extended-change {
  font-size: 1rem;
  font-weight: 700;
}

.hours-line {
  font-size: 0.82rem;
}

.price-skeleton {
  height: 2.5rem;
  width: 160px;
  border-radius: 6px;
  animation: shimmer 1.5s infinite;
  background: linear-gradient(
    90deg,
    var(--border) 25%,
    #475569 50%,
    var(--border) 75%
  );
  background-size: 200% 100%;
}

.pnl-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
}

.pnl-card.gain {
  border-color: rgba(34, 197, 94, 0.3);
}

.pnl-card.loss {
  border-color: rgba(239, 68, 68, 0.3);
}

.net-card {
  background: rgba(255, 255, 255, 0.02);
}

.pnl-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.82rem;
}

.pnl-label {
  font-size: 0.82rem;
}

.after-badge {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.7rem;
  margin-left: 4px;
}

.pnl-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pnl-pct {
  font-size: 1.8rem;
  font-weight: 700;
}

.pnl-value {
  font-size: 1.1rem;
  font-weight: 600;
}

.fee-breakdown {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0.75rem 0 0.5rem;
  border-top: 1px solid var(--border);
  padding-top: 0.5rem;
}

.fee-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
}

.est-row {
  border-top: 1px dashed var(--border);
  padding-top: 4px;
  margin-top: 2px;
}

.net-pct {
  font-size: 0.9rem;
  font-weight: 600;
  text-align: right;
}

.net-return-row {
  position: relative;
  padding-top: 0.5rem;
  margin-top: 0.25rem;
}

.net-return-row::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  background-size: 200% 100%;
  animation: net-return-border-sweep 8s ease-in-out infinite;
}

.net-return-label {
  font-weight: 700;
}

@keyframes net-return-border-sweep {
  0% {
    background-position: 200% 0;
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
  100% {
    background-position: -200% 0;
    opacity: 0.45;
  }
}

.stats-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 1.5rem;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}

.stat-item:nth-last-child(-n + 2) {
  border-bottom: none;
}

.stat-item .text-muted {
  font-size: 0.78rem;
}

.chart-controls {
  margin-bottom: 0.75rem;
}

.chart-mode-btn {
  min-width: 34px;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  padding: 0 0.55rem;
  font-size: 0.82rem;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.chart-mode-btn:active {
  background: rgba(255, 255, 255, 0.05);
}

.chart-mode-btn.active {
  background: var(--accent);
  color: #fff;
}

.chart-measure {
  margin-bottom: 0.75rem;
}

.measure-hint {
  font-size: 0.78rem;
  margin-bottom: 0.3rem;
}

.measure-summary {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.84rem;
}

.measure-tag {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.measure-low {
  color: #38bdf8;
}

.measure-high {
  color: #f59e0b;
}

.chart-selection-help {
  position: relative;
  margin: -0.35rem 0 0.9rem;
  padding: 0.55rem 2.25rem 0.55rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--neon-blue) 38%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--neon-blue) 5%, transparent);
  font-size: 0.76rem;
  line-height: 1.35;
  animation: chart-help-pulse 1.8s ease-in-out infinite;
}

.chart-selection-help p {
  margin: 0;
}

.chart-selection-help-close {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  width: 1.35rem;
  height: 1.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.68);
  color: var(--text-secondary);
  cursor: pointer;
}

.chart-selection-help-close i {
  font-size: 0.65rem;
}

.chart-selection-help-close:hover {
  color: var(--text-primary);
  border-color: color-mix(in srgb, var(--neon-blue) 60%, transparent);
}

@keyframes chart-help-pulse {
  0%,
  100% {
    border-color: color-mix(in srgb, var(--neon-blue) 32%, transparent);
    box-shadow: 0 0 0 color-mix(in srgb, var(--neon-blue) 0%, transparent);
  }
  50% {
    border-color: color-mix(in srgb, var(--neon-blue) 82%, transparent);
    box-shadow: 0 0 16px color-mix(in srgb, var(--neon-blue) 14%, transparent);
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  margin: 1rem 0 1.5rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.stat {
  min-height: 3rem;
  padding: 0.82rem 1rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 0.85rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.88rem;
  line-height: 1.25;
}

.stat:nth-child(odd) {
  border-right: 1px solid var(--border);
}

.stat span:last-child {
  text-align: right;
  white-space: nowrap;
  font-weight: 500;
}

.stat-extended {
  background: color-mix(in srgb, var(--purple) 8%, transparent);
}

.stat-label-info {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
}

.info-icon {
  font-size: 0.72rem;
  opacity: 0.55;
  cursor: pointer;
}

.info-icon:hover {
  opacity: 1;
  color: var(--accent);
}

.info-icon:focus {
  opacity: 1;
  color: var(--accent);
  outline: none;
}

.stat:nth-last-child(-n + 2) {
  border-bottom: none;
}

@media (max-width: 420px) {
  .stat {
    min-height: 2.9rem;
    padding: 0.74rem 0.85rem;
    column-gap: 0.55rem;
    font-size: 0.84rem;
  }

  .stat-label-info {
    gap: 0.22rem;
  }
}

.div-yield-val {
  color: var(--gold);
  font-weight: 600;
}

.sim-wrap {
  margin-bottom: 1.5rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.sim-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--bg-card);
}

.sim-title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 600;
}

.sim-title i {
  color: var(--accent);
}

.sim-head-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.sim-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-width: 132px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.sim-tab {
  min-height: 30px;
  border: none;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.sim-tab:last-child {
  border-right: none;
}

.sim-tab.active {
  background: var(--accent);
  color: #fff;
}

.sim-tab:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.sim-collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.sim-collapse-btn:hover {
  border-color: var(--accent);
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.04);
}

.sim-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  background: var(--bg-card);
  border: none;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.sim-toggle i:first-child {
  color: var(--accent);
}

.sim-chevron {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.sim-body {
  padding: 1rem;
  background: var(--bg-card);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sim-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.sim-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.sim-field label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.sim-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  padding: 0.75rem;
}

.sim-mode-bar {
  margin-bottom: 0.75rem;
  width: 100%;
}

:deep(.sim-mode-bar .p-selectbutton) {
  width: 100%;
  display: flex;
}

:deep(.sim-mode-bar .p-togglebutton) {
  flex: 1;
  font-size: 0.78rem;
  padding: 4px 8px;
}

.sim-placeholder {
  font-size: 0.8rem;
  text-align: center;
  padding: 0.25rem 0;
}

.sim-highlight {
  background: rgba(99, 102, 241, 0.1);
  border-radius: 6px;
  padding: 4px 6px;
  margin-bottom: 4px;
  font-weight: 700;
}

.sim-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
}

.sim-divider {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  margin-top: 2px;
  font-weight: 600;
}

.sim-net {
  font-size: 1rem;
  font-weight: 700;
}

.sim-profit {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  margin-top: 2px;
  font-weight: 700;
}

.sim-profit-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}

.sim-profit-pct {
  font-size: 1.2rem;
}

.page-loader {
  min-height: 260px;
}

.empty {
  height: auto;
}

.empty i {
  font-size: 3rem;
  color: var(--text-secondary);
}

.section-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.lots-list {
  display: flex;
  flex-direction: column;
}

.lot-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--border);
  gap: 0.5rem;
}

.lot-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.lot-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 2px;
}

.lot-tag {
  font-size: 0.7rem;
}

.lot-date {
  font-size: 0.78rem;
}

.lot-detail {
  font-size: 0.88rem;
}

.lot-extra {
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 4px;
}

.lot-extra i {
  font-size: 0.65rem;
}

.lot-notes {
  font-size: 0.78rem;
  font-style: italic;
  color: var(--text-secondary);
}

.lot-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.lot-total {
  font-weight: 600;
  font-size: 0.95rem;
}

.lot-avg {
  font-size: 0.75rem;
}

.lot-shares {
  font-size: 0.75rem;
}

.lot-edit-btn {
  margin-top: 2px;
  opacity: 0.6;
}

.dividends-section {
  margin-top: 1.5rem;
}

.dividends-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.dividends-summary {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.15rem;
  font-size: 0.78rem;
  text-align: right;
}

.div-total {
  font-size: 0.88rem;
  font-weight: 600;
}

.div-badge {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  background: color-mix(in srgb, var(--green) 15%, transparent);
  color: var(--neon-green);
  border-radius: 4px;
  padding: 1px 5px;
}

.drip-tag {
  font-size: 0.65rem;
  font-weight: 700;
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
  border-radius: 4px;
  padding: 1px 5px;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.signal-breakdown {
  margin-top: 0.6rem;
}

.signal-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.signal-chip {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  min-width: 72px;
  flex: 1;
}

.chip-label {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.chip-value {
  font-size: 0.75rem;
  font-weight: 600;
}

.chip-bull {
  background: color-mix(in srgb, var(--green) 8%, transparent);
  border-color: color-mix(in srgb, var(--green) 30%, transparent);
}

.chip-bull .chip-value {
  color: var(--green);
}

.chip-bear {
  background: color-mix(in srgb, var(--red) 8%, transparent);
  border-color: color-mix(in srgb, var(--red) 30%, transparent);
}

.chip-bear .chip-value {
  color: var(--red);
}

.chip-neutral {
  background: rgba(255, 255, 255, 0.03);
}

.chip-neutral .chip-value {
  color: var(--text-secondary);
}

/* ── Price targets ── */
.price-targets {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.75rem 0.9rem;
  margin-bottom: 0.9rem;
}

.targets-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.targets-add {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 4px;
  font-size: 0.8rem;
}

.target-row {
  padding: 0.4rem 0;
}

.target-row + .target-row {
  border-top: 1px solid var(--border);
}

.target-info {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.35rem;
}

.target-cond {
  font-size: 0.88rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.target-cond i {
  font-size: 0.7rem;
}

.target-dist {
  font-size: 0.76rem;
  font-weight: 600;
}

.target-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.target-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}

.fill-above {
  background: linear-gradient(90deg, color-mix(in srgb, var(--green) 50%, transparent), var(--green));
}

.fill-below {
  background: linear-gradient(90deg, color-mix(in srgb, var(--red) 50%, transparent), var(--red));
}

.fill-hit {
  box-shadow: 0 0 8px currentColor;
}

.target-note {
  display: block;
  font-size: 0.7rem;
  margin-top: 0.3rem;
}

/* ── Journal ── */
.journal-textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.85rem;
  padding: 0.6rem 0.75rem;
  margin-bottom: 0.6rem;
  resize: vertical;
}

.journal-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.journal-has-notes {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--neon-blue);
  display: inline-block;
  margin-left: 4px;
}
</style>
