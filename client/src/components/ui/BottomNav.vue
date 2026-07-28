<script setup>
import {useRoute} from 'vue-router'
import {trackEvent} from '@/composables/useAnalytics'
import {computed} from 'vue'
import {useI18n} from '@/composables/useI18n'

const route = useRoute()
const {t} = useI18n()

function trackNav(tab) {
  trackEvent('nav_click', {nav_item: tab.key})
}

const tabs = computed(() => [
  {key: 'dashboard', to: '/', icon: 'pi pi-chart-bar', label: t('common.dashboard'), tourKey: 'dashboard'},
  {key: 'watchlist', to: '/watchlist', icon: 'pi pi-eye', label: t('common.watchlist'), tourKey: 'watchlist'},
  {key: 'insights', to: '/insights', icon: 'pi pi-chart-pie', label: t('common.insights'), tourKey: 'insights'},
  {key: 'news', to: '/news', icon: 'pi pi-globe', label: t('common.news'), tourKey: 'news'},
  {key: 'about', to: '/help', icon: 'pi pi-info-circle', label: t('common.about')},
])

function isActive(tab) {
  if (tab.to === '/') return route.path === '/'
  if (tab.to === '/insights') return route.path === '/insights'
  return route.path.startsWith(tab.to)
}
</script>

<template>
  <nav class="app-nav">
    <div class="nav-brand">
      <span class="brand-mark">📈</span>
      <span class="brand-text gradient-title">StockFolio</span>
    </div>
    <div class="nav-items">
      <RouterLink
          v-for="tab in tabs"
          :key="tab.key"
          :class="{ active: isActive(tab), 'desktop-only': tab.desktopOnly }"
          :to="tab.to"
          :data-tour="tab.tourKey ? `nav-${tab.tourKey}` : null"
          class="nav-item"
          @click="trackNav(tab)"
      >
        <i :class="tab.icon"/>
        <span>{{ tab.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
/* ── Mobile: fixed bottom bar ── */
.app-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(var(--nav-height) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  /* background: var(--bg-secondary); */
  /* border-top: 1px solid var(--border); */
  z-index: 100;
}

.nav-brand {
  display: none;
}

/* hidden on mobile */
.nav-items {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  height: 100%;
}
.nav-item {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 0;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 10px;
  transition: color 0.2s;
}
.nav-item i { font-size: 20px; transition: filter 0.2s; }
.nav-item.active { color: var(--neon-blue); }
.nav-item.active i { filter: drop-shadow(0 0 6px var(--neon-blue)); }
.nav-item.active span { text-shadow: 0 0 8px var(--neon-blue); }

/* ── Desktop: vertical sidebar ── */
@media (min-width: 1024px) {
  .app-nav {
    position: relative;
    bottom: auto;
    left: auto;
    right: auto;
    height: 100dvh;
    width: 220px;
    flex-shrink: 0;
    padding-bottom: 0;
    border-top: none;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
  }

  .nav-brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 1.25rem 1.25rem 1rem;
  }

  .brand-mark {
    font-size: 1.4rem;
  }

  .brand-text {
    font-size: 1.15rem;
    font-weight: 800;
  }

  .nav-items {
    flex-direction: column;
    align-items: stretch;
    height: auto;
    gap: 4px;
    padding: 0.5rem 0.75rem;
  }

  .nav-item {
    flex: none;
    flex-direction: row;
    justify-content: flex-start;
    gap: 0.85rem;
    padding: 0.7rem 0.85rem;
    border-radius: 10px;
    font-size: 0.92rem;
    transition: background 0.15s, color 0.15s;
  }

  .nav-item i {
    font-size: 18px;
  }

  .nav-item:hover {
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-primary);
  }

  .nav-item.active {
    background: rgba(0, 207, 255, 0.1);
    color: var(--neon-blue);
  }

  .nav-item.active i {
    filter: none;
  }

  .nav-item.active span {
    text-shadow: none;
  }
}
</style>
