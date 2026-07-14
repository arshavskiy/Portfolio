<script setup>
import {onMounted, watch} from 'vue'
import {useBreakpoint} from '@/composables/useBreakpoint'
import {useWhatsNew} from '@/composables/useWhatsNew'
import {useTour} from '@/composables/useTour'
import MobileLayout from '@/layouts/MobileLayout.vue'
import DesktopLayout from '@/layouts/DesktopLayout.vue'
import WhatsNewModal from '@/components/ui/WhatsNewModal.vue'
import AccountShortcut from '@/components/ui/AccountShortcut.vue'
import AccountModal from '@/components/ui/AccountModal.vue'
import {ref} from 'vue'

const {isDesktop} = useBreakpoint()
const {checkForUpdates, visible: whatsNewVisible} = useWhatsNew()
const {maybeStartTour} = useTour()
const showAccount = ref(false)

onMounted(() => {
  checkForUpdates()
  // Auto-tour defers to the What's New modal, but ?tour always forces it.
  maybeStartTour({blocked: whatsNewVisible.value})
})

watch(whatsNewVisible, (visible, wasVisible) => {
  if (!visible && wasVisible) maybeStartTour()
})
</script>

<style scoped>
.page-actions-slot {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 0.75rem);
  right: 3.5rem;
  z-index: 90;
  display: flex;
  align-items: center;
}

@media (min-width: 1024px) {
  .page-actions-slot {
    display: none;
  }
}
</style>

<template>
  <div id="page-actions-slot" class="page-actions-slot"/>
  <DesktopLayout v-if="isDesktop" @open-account="showAccount = true"/>
  <MobileLayout v-else/>
  <AccountShortcut @click="showAccount = true"/>
  <AccountModal v-model:visible="showAccount"/>
  <WhatsNewModal/>
</template>
