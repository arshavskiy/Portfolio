<script setup>
import {computed, ref} from 'vue'
import {useBreakpoint} from '@/composables/useBreakpoint'
import Button from 'primevue/button'
import Menu from 'primevue/menu'

const props = defineProps({
  actions: {type: Array, required: true}, // [{key, icon, label, onClick, visible, dataTour, iconClass}]
})

const {isDesktop} = useBreakpoint()
const menu = ref(null)

const visibleActions = computed(() => props.actions.filter((a) => a.visible !== false))

const menuItems = computed(() =>
    visibleActions.value.flatMap((a) =>
        a.children
            ? a.children.map((c) => ({label: c.label, icon: c.icon, command: () => c.onClick()}))
            : [{label: a.label, icon: a.icon, command: () => a.onClick()}]
    )
)

function toggleMenu(event) {
  menu.value.toggle(event)
}
</script>

<template>
  <div class="watchlist-actions-menu">
    <template v-if="isDesktop">
      <span
          v-for="action in visibleActions"
          :key="action.key"
          :data-tour="action.dataTour"
          class="tour-action-anchor"
      >
        <Button
            v-tooltip.bottom="action.label"
            :class="action.buttonClass"
            :icon="action.icon"
            size="small"
            text
            @click="action.onClick"
        />
      </span>
    </template>

    <Teleport v-else to="#page-actions-slot">
      <span class="tour-action-anchor mobile-actions-trigger" data-tour="wl-actions-menu">
        <Button
            aria-haspopup="true"
            icon="pi pi-ellipsis-v"
            rounded
            text
            @click="toggleMenu"
        />
      </span>
      <Menu ref="menu" :model="menuItems" popup/>
    </Teleport>
  </div>
</template>

<style scoped>
.watchlist-actions-menu {
  display: flex;
  align-items: center;
}

.tour-action-anchor {
  display: inline-flex;
}

.mobile-actions-trigger :deep(.p-button) {
  width: 40px;
  height: 40px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-card) 85%, transparent);
  color: var(--text-secondary);
}

.mobile-actions-trigger :deep(.p-button .p-button-icon) {
  color: currentColor;
}

.mobile-actions-trigger :deep(.p-button:hover) {
  color: var(--neon-blue);
  border-color: rgba(0, 207, 255, 0.45);
  box-shadow: 0 0 10px rgba(0, 207, 255, 0.25);
}
</style>
