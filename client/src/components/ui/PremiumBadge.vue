<script setup>
defineProps({
  compact: {type: Boolean, default: false},
  label: {type: String, default: 'Premium'},
  title: {type: String, default: 'Premium feature'},
})
</script>

<template>
  <span :class="{compact}" :title="title" class="premium-badge">
    <i class="pi pi-crown" aria-hidden="true"/>
    <span v-if="!compact">{{ label }}</span>
  </span>
</template>

<style scoped>
.premium-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  width: fit-content;
  min-height: 1.25rem;
  padding: 0.1rem 0.4rem;
  border: 1px solid rgba(250, 204, 21, 0.35);
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.12);
  color: #facc15;
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 1;
  text-transform: uppercase;
}

.premium-badge i {
  font-size: 0.7rem;
}

.premium-badge.compact {
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
}
</style>
