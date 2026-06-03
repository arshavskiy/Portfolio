<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()

const tabs = [
  { name: 'Dashboard', to: '/', icon: 'pi pi-chart-bar', label: 'Dashboard' },
  { name: 'Holdings', to: '/holdings', icon: 'pi pi-briefcase', label: 'Holdings' },
  { name: 'Watchlist', to: '/watchlist', icon: 'pi pi-eye', label: 'Watchlist' },
  { name: 'Transactions', to: '/transactions', icon: 'pi pi-list', label: 'History' },
  { name: 'Profile', to: '/profile', icon: 'pi pi-user', label: 'Profile' },
]

function isActive(tab) {
  if (tab.to === '/') return route.path === '/'
  return route.path.startsWith(tab.to)
}
</script>

<template>
  <nav class="bottom-nav">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.name"
      :to="tab.to"
      class="nav-item"
      :class="{ active: isActive(tab) }"
    >
      <i :class="tab.icon" />
      <span>{{ tab.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(var(--nav-height) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  z-index: 100;
}
.nav-item {
  flex: 1;
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
</style>
