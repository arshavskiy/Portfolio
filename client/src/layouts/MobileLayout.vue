<script setup>
import BottomNav from '@/components/ui/BottomNav.vue'
</script>

<template>
  <div class="app-layout">
    <BottomNav/>
    <main class="main-content">
      <div class="content-inner">
        <RouterView/>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-layout {
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
  /* Clear the device status bar / notch in fullscreen PWA mode. */
  padding-top: env(safe-area-inset-top, 0px);
  margin-bottom: 75px;
}

/* Content stays full-bleed on mobile; centered with a cap on larger screens. */
.content-inner {
  width: 100%;
}

@media (min-width: 1024px) {
  .main-content { padding-top: 0; }
}

/* ── Desktop: sidebar + content ── */
@media (min-width: 1024px) {
  .app-layout {
    flex-direction: row;
  }

  .main-content {
    flex: 1;
  }

  .content-inner {
    max-width: 1200px;
    margin: 0 auto;
  }
}
</style>
