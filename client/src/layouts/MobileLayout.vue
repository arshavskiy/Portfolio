<script setup>
import BottomNav from '@/components/ui/BottomNav.vue'
</script>

<template>
  <div class="mobile-layout">
    <main class="main-content">
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
.main-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}
</style>
