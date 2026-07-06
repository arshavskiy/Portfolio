<script setup>
import {useRouter} from 'vue-router'
import Button from 'primevue/button'

const router = useRouter()
</script>

<template>
  <div class="help safe-bottom">
    <header class="page-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <h1 class="gradient-title">About</h1>
    </header>

    <div class="menu-list">
      <button class="menu-item" @click="router.push('/about')">
        <i class="pi pi-info-circle menu-icon"/>
        <span>About</span>
        <i class="pi pi-chevron-right text-muted" />
      </button>
      <button class="menu-item" @click="router.push('/math')">
        <i class="pi pi-calculator menu-icon"/>
        <span>Math Reference</span>
        <i class="pi pi-chevron-right text-muted" />
      </button>
      <button class="menu-item" @click="router.push('/disclaimer')">
        <i class="pi pi-shield menu-icon"/>
        <span>Financial Disclaimer</span>
        <i class="pi pi-chevron-right text-muted" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.help { padding: 1rem; }
@media (min-width: 768px) { .help { padding: 1.5rem; max-width: 640px; } }

.page-header { display: flex; align-items: center; gap: 0.25rem; margin-bottom: 1.25rem; }

.menu-list {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.9rem 1rem;
  border: none;
  border-bottom: 1px solid var(--border);
  background: none;
  color: var(--text-primary);
  font-size: 0.92rem;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}
.menu-item:last-child { border-bottom: none; }

.menu-item:active {
  background: rgba(255, 255, 255, 0.04);
}
.menu-item span { flex: 1; }

.menu-icon {
  color: var(--accent);
  font-size: 1rem;
}
</style>
