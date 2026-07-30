<script setup>
import {computed} from 'vue'
import {useStorage} from '@vueuse/core'
import {useRoute} from 'vue-router'
import {useDesktopFocusStore} from '@/stores/desktopFocus'
import {useAuthStore} from '@/stores/auth'
import {trackEvent} from '@/composables/useAnalytics'
import {useI18n} from '@/composables/useI18n'
import PositionDetailView from '@/views/PositionDetailView.vue'
import DesktopDashboardView from '@/views/DesktopDashboardView.vue'
import ErrorBoundary from '@/components/ui/ErrorBoundary.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import PremiumBadge from '@/components/ui/PremiumBadge.vue'

const emit = defineEmits(['open-account'])

const route = useRoute()
const focus = useDesktopFocusStore()
const auth = useAuthStore()
const {t} = useI18n()
const menuCollapsed = useStorage('desktop-menu-collapsed', false)
const detailPanelCollapsed = useStorage('desktop-detail-panel-collapsed', false)

function trackNav(item) {
  trackEvent('nav_click', {nav_item: item.key})
}

const isDashboard = computed(() => route.path === '/')
const PANEL_ROUTES = ['/watchlist']
const showPanel = computed(() => PANEL_ROUTES.some(p => route.path.startsWith(p)))

const navItems = computed(() => [
  {key: 'dashboard', name: 'Home', to: '/', icon: 'pi pi-chart-bar', tourKey: 'dashboard'},
  {key: 'watchlist', name: t('common.watchlist'), to: '/watchlist', icon: 'pi pi-eye', tourKey: 'watchlist'},
  {key: 'assistant', name: t('common.insights'), to: '/assistant', icon: 'pi pi-comments', tourKey: 'assistant', premium: true},
  {key: 'x-ray', name: t('common.xRay'), to: '/x-ray', icon: 'pi pi-shield', tourKey: 'x-ray', premium: true},
  ...(auth.isAdmin ? [{key: 'insights-data', name: t('common.data'), to: '/insights-data', icon: 'pi pi-database', tourKey: 'insights-data', premium: true}] : []),
  {key: 'news', name: t('common.news'), to: '/news', icon: 'pi pi-globe', tourKey: 'news'},
  {key: 'about', name: t('common.about'), to: '/help', icon: 'pi pi-info-circle', tourKey: 'about'},
].filter(item => !item.premium || auth.canUsePremiumFeatures))

function openAccount() {
  trackEvent('nav_click', {nav_item: 'account'})
  emit('open-account')
}

function isActive(item) {
  if (item.to === '/') return route.path === '/'
  if (item.to === '/assistant') return route.path === '/assistant' || route.path === '/insights'
  return route.path.startsWith(item.to)
}

function toggleMenu() {
  menuCollapsed.value = !menuCollapsed.value
}

function toggleDetailPanel() {
  detailPanelCollapsed.value = !detailPanelCollapsed.value
}
</script>

<template>
  <div class="desktop-shell" :class="{'menu-collapsed': menuCollapsed}">
    <nav class="sidebar" :class="{collapsed: menuCollapsed}">
      <div class="sidebar-brand">
        <button
          v-tooltip.right="'Account'"
          class="brand-mark brand-account"
          data-tour="nav-account"
          type="button"
          @click="openAccount"
        >
          <i class="pi pi-user"/>
        </button>
      </div>
      <div class="sidebar-language">
        <ThemeToggle/>
      </div>
      <div class="sidebar-nav">
        <RouterLink
            v-for="item in navItems"
            :key="item.key"
            :to="item.to"
            :class="{active: isActive(item)}"
            :data-tour="`nav-${item.tourKey}`"
            class="sidebar-item"
            v-tooltip.right="item.name"
            @click="trackNav(item)"
        >
          <i :class="item.icon"/>
          <span class="sidebar-label">{{ item.name }}</span>
          <PremiumBadge
              v-if="item.premium"
              :label="t('common.premium')"
              :title="t('common.premiumFeature')"
              compact
              class="sidebar-premium"
          />
        </RouterLink>
      </div>

      <div class="sidebar-footer"/>
    </nav>

    <!-- Dashboard: custom split layout (left=dashboard, right=watchlist) -->
    <DesktopDashboardView v-if="isDashboard" class="content-area" @open-account="openAccount"/>

    <!-- Holdings/Watchlist: main col + right position panel -->
    <template v-else-if="showPanel">
      <main class="main-col">
        <button
          v-tooltip.left="detailPanelCollapsed ? 'Show detail panel' : 'Hide detail panel'"
          class="panel-toggle panel-toggle-main"
          type="button"
          @click="toggleDetailPanel"
        >
          <i class="pi pi-window-maximize"/>
          <span>{{ detailPanelCollapsed ? 'Show panel' : 'Hide panel' }}</span>
        </button>
        <RouterView v-slot="{ Component, route: r }">
          <ErrorBoundary :key="r.fullPath">
            <component :is="Component"/>
          </ErrorBoundary>
        </RouterView>
      </main>
      <aside class="right-col" :class="{collapsed: detailPanelCollapsed}">
        <button
          v-tooltip.left="'Hide detail panel'"
          class="panel-toggle panel-toggle-side"
          type="button"
          @click="toggleDetailPanel"
        >
          <i class="pi pi-window-maximize"/>
          <span>Hide panel</span>
        </button>
        <div v-if="!focus.ticker" class="right-empty">
          <i class="pi pi-chart-line"/>
          <p>{{ t('nav.clickRowToViewPosition') }}</p>
        </div>
        <PositionDetailView
            v-else
            :key="focus.ticker"
            :ticker-override="focus.ticker"
            :panel-mode="true"
        />
      </aside>
    </template>

    <!-- All other routes: full-width, no panel -->
    <main v-else class="main-col">
      <RouterView v-slot="{ Component, route: r }">
        <ErrorBoundary :key="r.fullPath">
          <component :is="Component"/>
        </ErrorBoundary>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.desktop-shell {
  display: flex;
  height: 100dvh;
  overflow: hidden;
  background: #fbfaf8;
}

/* Sidebar */
.sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid #ece7e3;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 0.55rem 0;
  background: #fff9f7;
  transition: width 0.18s ease, padding 0.18s ease, border-color 0.18s ease;
}

.sidebar.collapsed {
  width: 52px;
  align-items: center;
}

.sidebar-brand {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 0 0.7rem;
  margin-bottom: 0.35rem;
}

.sidebar.collapsed .sidebar-brand {
  justify-content: center;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid #efe7e2;
  border-radius: 999px;
  background: #fff;
  color: #a59a92;
  font-size: 0.86rem;
  font-weight: 750;
  box-shadow: 0 1px 2px rgba(38, 32, 27, 0.035);
}

.brand-account {
  border: 1px solid #e8e2de;
  cursor: pointer;
  flex-shrink: 0;
}

.brand-account i {
  font-size: 0.82rem;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.25rem;
  padding: 0 0.45rem;
  width: 100%;
}

.sidebar.collapsed .sidebar-nav {
  align-items: center;
  padding: 0;
}

.sidebar-language {
  display: none;
}

.sidebar-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.7rem;
  width: 100%;
  min-height: 38px;
  padding: 0 0.8rem;
  border: none;
  border-radius: 9px;
  background: none;
  color: #7d746d;
  text-decoration: none;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 650;
  cursor: pointer;
  overflow: hidden;
  transition: background 0.18s, color 0.18s, box-shadow 0.18s, width 0.18s ease, padding 0.18s ease, gap 0.18s ease;
}

.sidebar.collapsed .sidebar-item {
  justify-content: center;
  width: 34px;
  min-height: 34px;
  padding: 0;
}

.sidebar-footer {
  margin-top: auto;
  padding: 0.5rem 0.45rem 0;
}

.sidebar.collapsed .sidebar-footer {
  padding-left: 0;
  padding-right: 0;
}

.sidebar-item i {
  font-size: 0.9rem;
  flex-shrink: 0;
  width: 14px;
  text-align: center;
}

.sidebar-label {
  position: static;
  width: auto;
  height: auto;
  overflow: visible;
  clip: auto;
  white-space: nowrap;
  max-width: 120px;
  opacity: 1;
  transform: translateX(0);
  transition: max-width 0.18s ease, opacity 0.14s ease, transform 0.18s ease, margin 0.18s ease;
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
  background: #fff;
  color: #1f1f1f;
  box-shadow: 0 1px 2px rgba(38, 32, 27, 0.06);
}

.sidebar-item.active {
  background: #fff;
  color: #111;
  box-shadow: 0 1px 3px rgba(38, 32, 27, 0.08);
}

/* Dashboard fills remaining space after sidebar */
.content-area {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

/* Main content column */
.main-col {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
  position: relative;
}

.main-inner {
  height: 100%;
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
.right-empty i { font-size: 2.5rem; opacity: 0.2; }

/* Right panel column */
.right-col {
  width: 300px;
  flex: 2;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  opacity: 1;
  transition: width 0.22s ease, flex 0.22s ease, opacity 0.18s ease, border-color 0.22s ease;
}

.right-col.collapsed {
  width: 0;
  flex: 0 0 0;
  border-left-color: transparent;
  opacity: 0;
  pointer-events: none;
}

.panel-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 32px;
  border: 1px solid #e4ded9;
  border-radius: 8px;
  background: #fff;
  color: #6e655f;
  padding: 0 0.7rem;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(38, 32, 27, 0.05);
}

.panel-toggle-main {
  position: sticky;
  top: 0.9rem;
  z-index: 3;
  margin: 0.9rem 0 0 auto;
  display: flex;
}

.panel-toggle-side {
  align-self: flex-end;
  margin: 0.75rem 0.75rem 0 0;
}


</style>
