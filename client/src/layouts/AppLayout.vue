<script setup>
import {useBreakpoint} from '@/composables/useBreakpoint'
import MobileLayout from '@/layouts/MobileLayout.vue'
import DesktopLayout from '@/layouts/DesktopLayout.vue'

const {isDesktop} = useBreakpoint()
</script>

<template>
  <DesktopLayout v-if="isDesktop"/>
  <MobileLayout v-else/>
</template>
