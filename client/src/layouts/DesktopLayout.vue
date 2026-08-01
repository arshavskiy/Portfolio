<script setup>
import { computed, ref } from "vue";
import { useStorage } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import Card from "primevue/card";
import Dialog from "primevue/dialog";
import ToggleSwitch from "primevue/toggleswitch";
import { useDesktopFocusStore } from "@/stores/desktopFocus";
import { useAuthStore } from "@/stores/auth";
import { useAiChatStore } from "@/stores/aiChat";
import { trackEvent } from "@/composables/useAnalytics";
import { useI18n } from "@/composables/useI18n";
import PositionDetailView from "@/views/PositionDetailView.vue";
import DesktopDashboardView from "@/views/DesktopDashboardView.vue";
import DesktopAdvisorPage from "@/views/DesktopAdvisorPage.vue";
import AskPortfolioPanel from "@/components/ui/AskPortfolioPanel.vue";
import ErrorBoundary from "@/components/ui/ErrorBoundary.vue";
import ThemeToggle from "@/components/ui/ThemeToggle.vue";
import PremiumBadge from "@/components/ui/PremiumBadge.vue";

const emit = defineEmits(["open-account"]);

const route = useRoute();
const focus = useDesktopFocusStore();
const auth = useAuthStore();
const { t } = useI18n();
const router = useRouter();
const aiChat = useAiChatStore();
const { messages: advisorMessages } = storeToRefs(aiChat);
const menuCollapsed = useStorage("desktop-menu-collapsed", false);
const detailPanelCollapsed = useStorage(
  "desktop-detail-panel-collapsed",
  false,
);
const aiPanelCollapsed = useStorage("desktop-ai-panel-collapsed", false);

const advisorPanelRef = ref(null);
const showConsentModal = ref(false);
const consentDraft = ref(false);
const savingConsent = ref(false);

const suggestionPrompts = [
  "What would happen to my portfolio if the market drops 30% tomorrow?",
  "Which holdings are carrying the most concentration risk?",
  "How should I rebalance while keeping upside potential?",
  "Which watchlist names look most interesting today?",
];

const aiDataSharingConsent = computed(
  () => auth.user?.aiDataSharingConsent === true,
);
const consentDirty = computed(
  () => consentDraft.value !== aiDataSharingConsent.value,
);

function toggleAiPanel() {
  aiPanelCollapsed.value = !aiPanelCollapsed.value;
}
function openConsentModal() {
  consentDraft.value = aiDataSharingConsent.value;
  showConsentModal.value = true;
}
function closeConsentModal() {
  showConsentModal.value = false;
  consentDraft.value = aiDataSharingConsent.value;
}
async function saveConsentModal() {
  if (!consentDirty.value) return;
  savingConsent.value = true;
  try {
    await auth.updatePreferences({ aiDataSharingConsent: consentDraft.value });
    showConsentModal.value = false;
  } catch {
  } finally {
    savingConsent.value = false;
  }
}
function toggleAdvisorHistory() {
  advisorPanelRef.value?.toggleHistory?.();
}
async function startNewAdvisorSession() {
  await advisorPanelRef.value?.startNewSession?.();
}
function sendAdvisorPrompt(prompt) {
  advisorPanelRef.value?.sendPrompt?.(prompt);
}

function trackNav(item) {
  trackEvent("nav_click", { nav_item: item.key });
}

const isDashboard = computed(() => route.path === "/");
const isAssistant = computed(
  () => route.path === "/assistant" || route.path === "/insights",
);
const PANEL_ROUTES = ["/watchlist"];
const showPanel = computed(() =>
  PANEL_ROUTES.some((p) => route.path.startsWith(p)),
);

const accountLabel = computed(
  () => auth.user?.name || auth.user?.email || t("common.account"),
);
const accountInitial = computed(() =>
  (accountLabel.value || "A").trim().charAt(0).toUpperCase(),
);

const dashboardNavItems = computed(() =>
  [
    {
      key: "dashboard",
      name: t("nav.home"),
      to: "/",
      icon: "pi pi-home",
      tourKey: "dashboard",
    },
    {
      key: "watchlist",
      name: t("common.watchlist"),
      to: "/watchlist",
      icon: "pi pi-eye",
      tourKey: "watchlist",
    },
    {
      key: "records",
      name: t("nav.records"),
      to: "/transactions",
      icon: "pi pi-list",
    },
    {
      key: "x-ray",
      name: t("common.xRay"),
      to: "/x-ray",
      icon: "pi pi-shield",
      tourKey: "x-ray",
      premium: true,
    },
    {
      key: "news",
      name: t("common.news"),
      to: "/news",
      icon: "pi pi-globe",
      tourKey: "news",
    },
  ].filter((item) => !item.premium || auth.canUsePremiumFeatures),
);

const toolsNavItems = computed(() =>
  [
    {
      key: "assistant",
      name: t("nav.assistantAI"),
      to: "/assistant",
      icon: "pi pi-comments",
      tourKey: "assistant",
      premium: true,
    },
    ...(auth.isAdmin
      ? [
          {
            key: "insights-data",
            name: t("common.data"),
            to: "/insights-data",
            icon: "pi pi-database",
            tourKey: "insights-data",
            premium: true,
          },
        ]
      : []),
  ].filter((item) => !item.premium || auth.canUsePremiumFeatures),
);

// Breadcrumb label map
const breadcrumbMap = {
  "/": t("nav.home"),
  "/watchlist": t("common.watchlist"),
  "/x-ray": t("common.xRay"),
  "/news": t("common.news"),
  "/help": t("common.about"),
  "/assistant": t("nav.assistantAI"),
  "/insights": t("nav.assistantAI"),
  "/insights-data": t("common.data"),
  "/transactions": t("nav.records"),
  "/rebalance": t("rebalance.title"),
  "/typology-map": t("common.insights"),
};

const breadcrumbLabel = computed(() => {
  for (const [prefix, label] of Object.entries(breadcrumbMap)) {
    if (
      route.path === prefix ||
      (prefix !== "/" && route.path.startsWith(prefix))
    ) {
      return label;
    }
  }
  return null;
});

function openAccount() {
  trackEvent("nav_click", { nav_item: "account" });
  emit("open-account");
}

function isActive(item) {
  if (item.to === "/") return route.path === "/";
  if (item.to === "/assistant")
    return route.path === "/assistant" || route.path === "/insights";
  return route.path.startsWith(item.to);
}

function toggleMenu() {
  menuCollapsed.value = !menuCollapsed.value;
}

function toggleDetailPanel() {
  detailPanelCollapsed.value = !detailPanelCollapsed.value;
}
</script>

<template>
  <div class="desktop-shell" :class="{ 'menu-collapsed': menuCollapsed }">
    <nav class="sidebar" :class="{ collapsed: menuCollapsed }">
      <div class="sidebar-brand">
        <button
          v-tooltip.right="menuCollapsed ? t('common.account') : null"
          class="brand-account"
          data-tour="nav-account"
          type="button"
          @click="openAccount"
        >
          <span class="account-avatar">
            <span v-if="!menuCollapsed">{{ accountInitial }}</span>
            <i v-else class="pi pi-user" />
          </span>
          <span v-if="!menuCollapsed" class="account-copy">
            <strong>{{ accountLabel }}</strong>
            <small>{{ t('common.account') }}</small>
          </span>
        </button>
      </div>

      <div class="sidebar-nav">
        <span v-if="!menuCollapsed" class="nav-group-label">{{ t('common.dashboard') }}</span>
        <RouterLink
          v-for="item in dashboardNavItems"
          :key="item.key"
          :to="item.to"
          :class="{ active: isActive(item) }"
          :data-tour="`nav-${item.tourKey}`"
          class="sidebar-item"
          v-tooltip.right="menuCollapsed ? item.name : null"
          @click="trackNav(item)"
        >
          <i :class="item.icon" />
          <span class="sidebar-label">{{ item.name }}</span>
        </RouterLink>

        <template v-if="toolsNavItems.length">
          <span
            v-if="!menuCollapsed"
            class="nav-group-label nav-group-label--tools"
            >{{ t('nav.tools') }}</span
          >
          <div v-else class="nav-group-divider" />
          <RouterLink
            v-for="item in toolsNavItems"
            :key="item.key"
            :to="item.to"
            :class="{ active: isActive(item) }"
            :data-tour="`nav-${item.tourKey}`"
            class="sidebar-item"
            v-tooltip.right="menuCollapsed ? item.name : null"
            @click="trackNav(item)"
          >
            <i :class="item.icon" />
            <span class="sidebar-label">{{ item.name }}</span>
            <PremiumBadge
              v-if="item.premium"
              :label="t('common.premium')"
              :title="t('common.premiumFeature')"
              compact
              class="sidebar-premium"
            />
          </RouterLink>
        </template>
      </div>

      <div class="sidebar-footer">
        <ThemeToggle />
      </div>
    </nav>

    <!-- All routes rendered inside main-col with shared topbar -->
    <main class="main-col" :class="{ 'has-panel': showPanel }">
      <!-- Topbar breadcrumb -->
      <header class="main-topbar">
        <div class="topbar-crumbs">
          <button class="ai-toggle-btn" type="button" @click="toggleMenu">
            <i class="panel-toggle-glyph" />
          </button>
          <span v-if="breadcrumbLabel" class="crumb-sep">›</span>
          <span v-if="breadcrumbLabel" class="crumb-page">{{
            breadcrumbLabel
          }}</span>
        </div>
        <div id="layout-topbar-actions" class="topbar-actions-slot">
          <button
            v-if="!isAssistant"
            v-tooltip.bottom="
              aiPanelCollapsed ? t('insights.advisorShowPanel') : t('insights.advisorHidePanel')
            "
            class="ai-toggle-btn"
            type="button"
            @click="toggleAiPanel"
          >
            <span class="panel-toggle-glyph" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div class="topbar-rule" />

      <!-- Dashboard -->
      <DesktopDashboardView
        v-if="isDashboard"
        class="dashboard-inset"
        @open-account="openAccount"
      />

      <!-- Assistant -->
      <DesktopAdvisorPage v-else-if="isAssistant" class="advisor-inset" />

      <!-- Watchlist + right panel -->
      <template v-else-if="showPanel">
        <div class="panel-layout">
          <div class="page-scroll panel-main">
            <RouterView v-slot="{ Component, route: r }">
              <div class="page-inner">
                <ErrorBoundary :key="r.fullPath">
                  <component :is="Component" />
                </ErrorBoundary>
              </div>
            </RouterView>
          </div>
          <aside class="right-col" :class="{ collapsed: detailPanelCollapsed }">
            <div v-if="!focus.ticker" class="right-empty">
              <i class="pi pi-chart-line" />
              <p>{{ t("nav.clickRowToViewPosition") }}</p>
            </div>
            <PositionDetailView
              v-else
              :key="focus.ticker"
              :ticker-override="focus.ticker"
              :panel-mode="true"
            />
          </aside>
        </div>
      </template>

      <!-- All other routes -->
      <template v-else>
        <div class="page-scroll">
          <RouterView v-slot="{ Component, route: r }">
            <div class="page-inner">
              <ErrorBoundary :key="r.fullPath">
                <component :is="Component" />
              </ErrorBoundary>
            </div>
          </RouterView>
        </div>
      </template>
    </main>

    <!-- Global AI advisor rail — hidden on /assistant (which is full-page advisor) -->
    <aside
      v-if="!isAssistant"
      class="advisor-rail"
      :class="{ collapsed: aiPanelCollapsed }"
    >
      <div class="advisor-head">
        <div>
          <strong>{{ t('insights.advisorTitle') }}</strong>
          <span>{{ t('insights.advisorSubtitle') }}</span>
        </div>
        <div class="advisor-actions">
          <Button
            v-tooltip.bottom="t('insights.advisorOpenHistory')"
            class="advisor-action-btn"
            icon="pi pi-history"
            severity="secondary"
            text
            rounded
            type="button"
            @click="toggleAdvisorHistory"
          />
          <Button
            v-tooltip.bottom="t('insights.advisorSettings')"
            class="advisor-action-btn"
            icon="pi pi-cog"
            severity="secondary"
            text
            rounded
            type="button"
            @click="openConsentModal"
          />
          <Button
            v-tooltip.bottom="t('insights.advisorNewSession')"
            class="advisor-action-btn"
            icon="pi pi-plus"
            severity="secondary"
            text
            rounded
            type="button"
            @click="startNewAdvisorSession"
          />
        </div>
      </div>
      <div v-if="!advisorMessages.length" class="advisor-hero">
        <span class="advisor-hero-mark">
          <i class="pi pi-comments" />
        </span>
        <strong>{{ t('insights.advisorHeroTitle') }}</strong>
        <p v-if="aiDataSharingConsent">{{ t('insights.advisorHeroText') }}</p>
        <p v-else>{{ t('insights.advisorHeroTextNoConsent') }}</p>
        <Button
          class="advisor-hero-cta"
          :icon="aiDataSharingConsent ? 'pi pi-sparkles' : 'pi pi-shield'"
          :label="aiDataSharingConsent ? t('insights.advisorOpenFullChat') : t('insights.advisorEnableAi')"
          outlined
          @click="aiDataSharingConsent ? router.push('/assistant') : openConsentModal()"
        />
      </div>
      <AskPortfolioPanel
        v-if="aiDataSharingConsent"
        ref="advisorPanelRef"
        class="advisor-panel"
      />
      <div v-if="aiDataSharingConsent" class="suggestions">
        <span>{{ t('insights.advisorSuggestions') }}</span>
        <Button
          v-for="prompt in suggestionPrompts"
          :key="prompt"
          class="suggestion-btn"
          severity="secondary"
          text
          :label="prompt"
          @click="sendAdvisorPrompt(prompt)"
        />
      </div>
    </aside>

    <Dialog
      v-model:visible="showConsentModal"
      :draggable="false"
      :style="{ width: '95vw', maxWidth: '560px' }"
      modal
      @hide="closeConsentModal"
    >
      <template #header>
        <div class="consent-dialog-title">
          <i class="pi pi-sparkles" />
          <div>
            <strong>{{ t('insights.consentTitle') }}</strong>
            <span>{{ t('insights.consentSubtitle') }}</span>
          </div>
        </div>
      </template>
      <Card class="consent-card">
        <template #content>
          <div class="consent-toggle-row">
            <div class="consent-switch-wrap">
              <ToggleSwitch v-model="consentDraft" />
            </div>
            <div class="consent-copy">
              <strong>{{ t('insights.consentToggleLabel') }}</strong>
              <p>{{ t('insights.consentToggleText') }}</p>
            </div>
          </div>
        </template>
      </Card>
      <template #footer>
        <div class="consent-footer">
          <Button :label="t('common.cancel')" outlined @click="closeConsentModal" />
          <Button
            :disabled="!consentDirty || savingConsent"
            :loading="savingConsent"
            :label="t('transactions.saveChanges')"
            @click="saveConsentModal"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.desktop-shell {
  display: flex;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg-primary);
}

/* ── Sidebar ── */
.sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 0.55rem 0;
  background: var(--bg-secondary);
  transition:
    width 0.18s ease,
    padding 0.18s ease,
    border-color 0.18s ease;
}

.sidebar.collapsed {
  width: 52px;
  align-items: center;
}

.sidebar-brand {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 0.45rem 0.7rem;
  margin-bottom: 0.35rem;
}

.sidebar.collapsed .sidebar-brand {
  padding-inline: 0;
}

.brand-account {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  min-height: 42px;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.brand-account:hover {
  border-color: var(--accent);
  background: var(--bg-primary);
}

.sidebar.collapsed .brand-account {
  width: 36px;
  min-height: 36px;
  justify-content: center;
  padding: 0;
  border-radius: 999px;
}

.account-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 15%, var(--bg-secondary));
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 800;
}

.account-avatar i {
  font-size: 0.8rem;
}

.account-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.06rem;
}

.account-copy strong,
.account-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-copy strong {
  font-size: 0.83rem;
  font-weight: 700;
}

.account-copy small {
  color: var(--text-secondary);
  font-size: 0.69rem;
  font-weight: 600;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.15rem;
  padding: 0 0.45rem;
  width: 100%;
  flex: 1;
  overflow-y: auto;
}

.sidebar.collapsed .sidebar-nav {
  align-items: center;
  padding: 0;
}

.nav-group-label {
  display: block;
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  padding: 0.55rem 0.8rem 0.2rem;
  opacity: 0.6;
  white-space: nowrap;
}

.nav-group-label--tools {
  margin-top: 0.35rem;
}

.nav-group-divider {
  height: 1px;
  background: var(--border);
  margin: 0.45rem 6px;
  width: calc(100% - 12px);
}

.sidebar-footer {
  padding: 0.5rem 0.45rem 0.3rem;
  border-top: 1px solid var(--border);
  margin-top: 0.5rem;
  display: flex;
  justify-content: center;
}

.sidebar.collapsed .sidebar-footer {
  padding-inline: 0;
}

.sidebar-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.7rem;
  width: 100%;
  min-height: 36px;
  padding: 0 0.8rem;
  border: none;
  border-radius: 9px;
  background: none;
  color: var(--text-secondary);
  text-decoration: none;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;
  transition:
    background 0.15s,
    color 0.15s,
    box-shadow 0.15s,
    width 0.18s ease,
    padding 0.18s ease,
    gap 0.18s ease;
}

.sidebar.collapsed .sidebar-item {
  justify-content: center;
  width: 34px;
  min-height: 34px;
  padding: 0;
}

.sidebar-item i {
  font-size: 0.88rem;
  flex-shrink: 0;
  width: 14px;
  text-align: center;
}

.sidebar-label {
  white-space: nowrap;
  max-width: 120px;
  opacity: 1;
  transform: translateX(0);
  transition:
    max-width 0.18s ease,
    opacity 0.14s ease,
    transform 0.18s ease,
    margin 0.18s ease;
}

.sidebar-premium {
  display: none;
}

.sidebar.collapsed .sidebar-label {
  max-width: 0;
  opacity: 0;
  transform: translateX(-6px);
  margin: 0;
}

.sidebar-item:hover {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.sidebar-item.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* ── Main column ── */
.main-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.main-topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 1.1rem 0 0.75rem;
}

.topbar-actions-slot {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
  flex-direction: row-reverse;
}

.topbar-crumbs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.crumb-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: none;
  color: var(--text-secondary);
  border-radius: 7px;
  cursor: pointer;
  font-size: 0.88rem;
  transition:
    background 0.15s,
    color 0.15s;
}

.crumb-toggle:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.crumb-sep {
  color: var(--text-secondary);
  font-size: 0.85rem;
  opacity: 0.45;
  user-select: none;
}

.crumb-page {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text-primary);
}

.topbar-rule {
  flex-shrink: 0;
  height: 1px;
  background: var(--border);
}

/* Dashboard: takes full remaining space, manages its own scroll */
.dashboard-inset {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Advisor: flex column, full height */
.advisor-inset {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Panel layout (watchlist + right col) */
.panel-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.panel-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
}

.page-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
  padding: 1.35rem 1.5rem 2rem;
}

.page-inner {
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.panel-main {
  padding: 0;
}

/* Right panel */
.right-col {
  width: 300px;
  flex: 2;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  overflow: scroll;
  display: flex;
  flex-direction: column;
  opacity: 1;
  transition:
    width 0.22s ease,
    flex 0.22s ease,
    opacity 0.18s ease,
    border-color 0.22s ease;
}

.right-col.collapsed {
  width: 0;
  flex: 0 0 0;
  border-left-color: transparent;
  opacity: 0;
  pointer-events: none;
}

.right-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-align: center;
  padding: 2rem;
}

.right-empty i {
  font-size: 2.5rem;
  opacity: 0.2;
}

/* ── AI advisor rail ── */
.ai-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
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

.advisor-rail {
  --desktop-surface: var(--bg-primary);
  --desktop-panel: var(--bg-secondary);
  --desktop-border: var(--border);
  --desktop-text: var(--text-primary);
  --desktop-muted: var(--text-secondary);
  --desktop-hover: color-mix(in srgb, var(--text-primary) 6%, transparent);
  --desktop-elevated-shadow: 0 1px 2px
    color-mix(in srgb, var(--text-primary) 8%, transparent);

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
  min-width: 320px;
  max-width: 30vw;
  transition:
    min-width 0.22s ease,
    max-width 0.22s ease,
    padding 0.22s ease,
    opacity 0.18s ease,
    border-color 0.22s ease;
  opacity: 1;
}

.advisor-rail.collapsed {
  min-width: 0;
  max-width: 0;
  padding-left: 0;
  padding-right: 0;
  border-left-color: transparent;
  opacity: 0;
  pointer-events: none;
}

.advisor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.65rem;
  flex-shrink: 0;
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

.advisor-actions {
  display: flex;
  align-items: center;
  gap: 0.1rem;
  flex-shrink: 0;
}

.advisor-actions :deep(.advisor-action-btn.p-button) {
  color: var(--text-secondary);
  border: none;
  box-shadow: none;
}

.advisor-actions :deep(.advisor-action-btn.p-button:hover) {
  color: var(--text-primary);
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
.advisor-hero-cta :deep(.p-button) {
  min-height: 34px;
}
.advisor-hero-cta :deep(.p-button-label) {
  font-size: 0.78rem;
  font-weight: 700;
}

.suggestions {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding-top: 0.5rem;
  flex-shrink: 0;
}

.suggestions > span {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--desktop-muted);
  padding: 0 0.25rem 0.2rem;
}

.suggestions :deep(.suggestion-btn.p-button) {
  justify-content: flex-start;
  padding: 0.3rem 0.4rem;
  border-radius: 7px;
}

.suggestions :deep(.suggestion-btn.p-button .p-button-label) {
  font-size: 0.78rem;
  font-weight: 500;
  text-align: left;
  white-space: normal;
  color: var(--desktop-text);
}

/* Consent dialog */
.consent-dialog-title {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.consent-dialog-title i {
  font-size: 1rem;
  color: var(--text-primary);
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
}
.consent-dialog-title span {
  color: var(--text-secondary);
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
}
.consent-copy p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.45;
}
.consent-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
  width: 100%;
}
</style>
