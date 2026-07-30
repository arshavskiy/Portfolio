<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  getMarketHoursState,
  MARKET_HOURS_BY_GROUP,
} from "@/composables/useMarketHours";
import { useI18n } from "@/composables/useI18n";

const now = ref(new Date());
const { locale, t } = useI18n();
let timer = null;

const metas = computed(() =>
  ["Israel", "US"]
    .map((name) => {
      const market = MARKET_HOURS_BY_GROUP[name];
      const meta = market ? getMarketHoursState(market, now.value) : null;
      return meta ? { group: name, ...meta } : null;
    })
    .filter(Boolean),
);

function statusClass(meta) {
  if (meta.statusTone === "phase") return "meta-phase";
  return meta.statusTone === "open" ? "meta-open" : "meta-closed";
}

function displayMarketGroup(name) {
  return name === "US"
    ? t("dashboard.marketGroupUS")
    : name === "Israel"
      ? t("dashboard.marketGroupIsrael")
      : name;
}

function localDuration(value = "") {
  return locale.value === "ru"
    ? value
        .replace(/(\d+)d/g, "$1д")
        .replace(/(\d+)h/g, "$1ч")
        .replace(/(\d+)m/g, "$1м")
    : value;
}

function displayMarketHoursLabel(value = "") {
  const patterns = [
    [/^Regular in (.+)$/u, "dashboard.regularIn"],
    [/^Pre-Market in (.+)$/u, "dashboard.preMarketIn"],
    [/^After-Hours in (.+)$/u, "dashboard.afterHoursIn"],
    [/^Closed in (.+)$/u, "dashboard.closedIn"],
    [/^Pre until (.+)$/u, "dashboard.preUntil"],
    [/^Pre in (.+)$/u, "dashboard.preIn"],
    [/^Regular until (.+)$/u, "dashboard.regularUntil"],
    [/^Post until (.+)$/u, "dashboard.postUntil"],
    [/^Opens in (.+)$/u, "dashboard.opensIn"],
  ];
  for (const [pattern, key] of patterns) {
    const match = value.match(pattern);
    if (match) return t(key, { duration: localDuration(match[1]) });
  }
  const exact = {
    Open: "common.open",
    Closed: "dashboard.closed",
    "Pre-Market Trading": "dashboard.preMarketTrading",
    "Before Trade": "dashboard.beforeTrade",
    "After-Hours Trading": "dashboard.afterHoursTrading",
    "After Trade": "dashboard.afterTrade",
  }[value];
  return exact ? t(exact) : value;
}

function displaySessionLabel(value = "") {
  return value.replace("Pre-Market", t("dashboard.preMarketSession"));
}

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 60000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div v-if="metas.length" class="market-meta-list">
    <div
      v-for="meta in metas"
      :key="meta.group"
      :class="{ 'market-meta-break': meta.group === 'US' }"
      class="market-meta"
    >
      <span class="meta-group">{{ displayMarketGroup(meta.group) }}</span>
      <span :class="statusClass(meta)" class="meta-status">{{
        displayMarketHoursLabel(meta.statusLabel)
      }}</span>
      <span class="text-muted"
        >{{ displayMarketHoursLabel(meta.nextLabel) }}
        <span
          class="session text-muted"
          v-html="displaySessionLabel(meta.sessionLabel)"
        />
      </span>
    </div>
  </div>
</template>

<style scoped>
.market-meta-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.35rem;
  min-width: min(100%, 340px);
}

.market-meta {
  display: grid;
  grid-template-columns: 38px 64px minmax(96px, 1fr) minmax(120px, auto);
  align-items: baseline;
  column-gap: 0.45rem;
  font-size: 0.68rem;
  white-space: nowrap;
}

.market-meta-break {
  grid-template-columns: 38px 64px minmax(96px, 1fr);
}

.market-meta-break .session {
  grid-column: 1 / -1;
  text-align: left;
  margin-top: 0.1rem;
}

.meta-group {
  font-weight: 700;
}
.meta-status {
  font-weight: 700;
}
.meta-open {
  color: var(--neon-green);
}
.meta-closed {
  color: var(--neon-red);
}
.meta-phase {
  color: #93c5fd;
}
.session {
  text-align: right;
}
</style>
