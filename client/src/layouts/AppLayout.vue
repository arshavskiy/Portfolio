<script setup>
import {onMounted} from 'vue'
import {useBreakpoint} from '@/composables/useBreakpoint'
import {useWhatsNew} from '@/composables/useWhatsNew'
import MobileLayout from '@/layouts/MobileLayout.vue'
import DesktopLayout from '@/layouts/DesktopLayout.vue'
import WhatsNewModal from '@/components/ui/WhatsNewModal.vue'

const {isDesktop} = useBreakpoint()
const {checkForUpdates} = useWhatsNew()

onMounted(() => {
  checkForUpdates()
})
</script>

<template>
  <DesktopLayout v-if="isDesktop"/>
  <MobileLayout v-else/>
  <WhatsNewModal/>
</template>
