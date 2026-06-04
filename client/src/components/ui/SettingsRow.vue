<script setup>
defineProps({
  label: {type: String, required: true},
  icon: {type: String, default: ''},
})
</script>

<template>
  <div class="settings-row">
    <div class="row-label">
      <i v-if="icon" :class="icon" class="row-icon"/>
      <span>{{ label }}</span>
    </div>
    <div class="row-control">
      <slot/>
    </div>
  </div>
</template>

<style scoped>
.settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.row-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-primary);
}

.row-icon {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.row-control {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
</style>
