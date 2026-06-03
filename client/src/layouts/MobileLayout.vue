<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import BottomNav from '@/components/ui/BottomNav.vue'

const router = useRouter()
const auth = useAuthStore()
</script>

<template>
  <div class="mobile-layout">
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
  min-height: 100dvh;
  background: var(--bg-primary);
}
.main-content {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior-y: contain;
}
</style>
