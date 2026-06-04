<script setup>
import BottomNav from '@/components/ui/BottomNav.vue'
import {useChartRange} from '@/composables/useChartRange'

const range = useChartRange()

const options = [
  {label: '1W', value: '1wk'},
  {label: '1M', value: '1mo'},
]
</script>

<template>
  <div class="mobile-layout">
    <div class="top-bar">
      <div class="range-toggle">
        <button
            v-for="opt in options"
            :key="opt.value"
            :class="{ active: range === opt.value }"
            class="range-btn"
            @click="range = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
    <main class="main-content safe-bottom">
      <RouterView />
    </main>
    <BottomNav />
  </div>
</template>

<style scoped>
.mobile-layout {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg-primary);
}

.top-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 0.4rem 1rem 0;
  flex-shrink: 0;
  //position: absolute;
  //right: 80px;
  //top: 15px;
}

.range-toggle {
  display: flex;
  background: #1a1a1a;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.range-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  letter-spacing: 0.04em;
}

.range-btn.active {
  background: var(--accent);
  color: #fff;
}

.main-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}
</style>
