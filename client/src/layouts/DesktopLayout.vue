<script setup>
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {useDesktopFocusStore} from '@/stores/desktopFocus'
import {useAuthStore} from '@/stores/auth'
import {trackEvent} from '@/composables/useAnalytics'
import {useI18n} from '@/composables/useI18n'
import PositionDetailView from '@/views/PositionDetailView.vue'
import DesktopDashboardView from '@/views/DesktopDashboardView.vue'
import ErrorBoundary from '@/components/ui/ErrorBoundary.vue'
import LanguageSelect from '@/components/ui/LanguageSelect.vue'
import PremiumBadge from '@/components/ui/PremiumBadge.vue'

const emit = defineEmits(['open-account'])

const route = useRoute()
const focus = useDesktopFocusStore()
const auth = useAuthStore()
const {t} = useI18n()

function trackNav(item) {
  trackEvent('nav_click', {nav_item: item.key})
}

const isDashboard = computed(() => route.path === '/')
const PANEL_ROUTES = ['/watchlist']
const showPanel = computed(() => PANEL_ROUTES.some(p => route.path.startsWith(p)))

const navItems = computed(() => [
  {key: 'dashboard', name: t('common.dashboard'), to: '/', icon: 'pi pi-chart-bar', tourKey: 'dashboard'},
  {key: 'watchlist', name: t('common.watchlist'), to: '/watchlist', icon: 'pi pi-eye', tourKey: 'watchlist'},
  {key: 'insights', name: t('common.insights'), to: '/insights', icon: 'pi pi-sparkles', tourKey: 'insights', premium: true},
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
  if (item.to === '/insights') return route.path === '/insights'
  return route.path.startsWith(item.to)
}
</script>

<template>
  <div class="desktop-shell">
    <nav class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-name gradient-title">StockFolio</span>
      </div>
      <div class="sidebar-language">
        <LanguageSelect/>
      </div>
      <div class="sidebar-nav">
        <RouterLink
            v-for="item in navItems"
            :key="item.key"
            :to="item.to"
            :class="{active: isActive(item)}"
            :data-tour="`nav-${item.tourKey}`"
            class="sidebar-item"
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

      <div class="sidebar-footer">
        <button
            class="sidebar-item"
            data-tour="nav-account"
            type="button"
            @click="openAccount"
        >
          <i class="pi pi-user"/>
          <span class="sidebar-label">{{ t('common.account') }}</span>
        </button>
      </div>
    </nav>

    <!-- Dashboard: custom split layout (left=dashboard, right=watchlist) -->
    <DesktopDashboardView v-if="isDashboard" class="content-area"/>

    <!-- Holdings/Watchlist: main col + right position panel -->
    <template v-else-if="showPanel">
      <main class="main-col">
        <RouterView v-slot="{ Component, route: r }">
          <ErrorBoundary :key="r.fullPath">
            <component :is="Component"/>
          </ErrorBoundary>
        </RouterView>
      </main>
      <aside class="right-col">
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
  background: var(--bg-primary);
}

/* Sidebar */
.sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 0.75rem 0;
  background: var(--bg-secondary);
}

.sidebar-brand {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}

.brand-icon { font-size: 1.4rem; }

.brand-name {
  font-size: 1.75rem;
  font-weight: 800;
  text-align: center;
  width: 100%;
  background: linear-gradient(135deg, #00cfff 0%, #a855f7 40%, #ff3366 70%, #00cfff 100%);
  background-size: 250% 250%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: brand-flow 3s ease infinite;
}

@keyframes brand-flow {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.sidebar-language {
  display: flex;
  justify-content: center;
  padding: 0 1rem 0.75rem;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.6rem 0.85rem;
  border: none;
  border-radius: 10px;
  background: none;
  color: var(--text-secondary);
  text-decoration: none;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.sidebar-footer {
  margin-top: auto;
  padding: 0.5rem 8px;
  border-top: 1px solid var(--border);
}

.sidebar-item i {
  font-size: 15px;
  flex-shrink: 0;
  width: 18px;
  text-align: center;
}

.sidebar-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-premium {
  margin-left: auto;
  flex-shrink: 0;
}

.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.sidebar-item.active {
  background: rgba(0, 207, 255, 0.12);
  color: var(--neon-blue);
  font-weight: 600;
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
}


</style>
