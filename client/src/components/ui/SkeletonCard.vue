<script setup></script>

<template>
  <div class="skeleton-card">
    <div class="skel skel-title" />
    <div class="skel skel-body" />
    <div class="skel skel-short" />
  </div>
</template>

<style scoped>
.skeleton-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.skel {
  background: linear-gradient(90deg, var(--border) 25%, #475569 50%, var(--border) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  height: 14px;
}
.skel-title { height: 18px; width: 60%; }
.skel-body { height: 14px; width: 100%; }
.skel-short { height: 14px; width: 40%; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>
