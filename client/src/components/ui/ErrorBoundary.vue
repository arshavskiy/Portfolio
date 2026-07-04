<script setup>
import {onErrorCaptured, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {logClientError} from '@/composables/useClientErrors'
import Button from 'primevue/button'

const failed = ref(false)
const route = useRoute()

onErrorCaptured((error, instance, info) => {
  failed.value = true
  logClientError(error, 'Render error boundary', {
    info,
    component: instance?.$options?.name,
    route: route.fullPath,
  })
  return false
})

// Recover automatically when the user navigates elsewhere.
watch(() => route.fullPath, () => {
  failed.value = false
})

function reload() {
  window.location.reload()
}
</script>

<template>
  <div v-if="failed" class="error-boundary">
    <i class="pi pi-exclamation-triangle"/>
    <p class="eb-title">Something went wrong loading this page</p>
    <Button label="Reload" icon="pi pi-refresh" @click="reload"/>
  </div>
  <slot v-else/>
</template>

<style scoped>
.error-boundary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 60vh;
  padding: 2rem;
  text-align: center;
}

.error-boundary .pi-exclamation-triangle {
  font-size: 2rem;
  color: var(--text-secondary);
}

.eb-title {
  color: var(--text-secondary);
  font-size: 0.95rem;
}
</style>
