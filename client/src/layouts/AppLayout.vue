<script setup>
import {onMounted, watch} from 'vue'
import {useBreakpoint} from '@/composables/useBreakpoint'
import {useWhatsNew} from '@/composables/useWhatsNew'
import {useTour} from '@/composables/useTour'
import MobileLayout from '@/layouts/MobileLayout.vue'
import DesktopLayout from '@/layouts/DesktopLayout.vue'
import WhatsNewModal from '@/components/ui/WhatsNewModal.vue'

const {isDesktop} = useBreakpoint()
const {checkForUpdates, visible: whatsNewVisible} = useWhatsNew()
const {maybeStartTour} = useTour()

onMounted(() => {
  checkForUpdates()
  // Auto-tour defers to the What's New modal, but ?tour always forces it.
  maybeStartTour({blocked: whatsNewVisible.value})
})

watch(whatsNewVisible, (visible, wasVisible) => {
  if (!visible && wasVisible) maybeStartTour()
})
</script>

<template>
  <DesktopLayout v-if="isDesktop"/>
  <MobileLayout v-else/>
  <WhatsNewModal/>
</template>
