<script setup>
import {useRouter} from 'vue-router'
import {useBreakpoint} from '@/composables/useBreakpoint'
import {useI18n} from '@/composables/useI18n'
import Button from 'primevue/button'
import FeeProfilesPanel from '@/components/ui/FeeProfilesPanel.vue'

defineProps({
  embedded: {type: Boolean, default: false},
})

const router = useRouter()
const {isDesktop} = useBreakpoint()
const {t} = useI18n()
</script>

<template>
  <div class="fee-profiles-page safe-bottom">
    <header v-if="!embedded && !isDesktop" class="page-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()"/>
      <h1 class="gradient-title">{{ t('feeProfiles.title') }}</h1>
    </header>

    <FeeProfilesPanel/>
  </div>
</template>

<style scoped>
.fee-profiles-page {
  padding: 1rem;
  max-width: 620px;
  margin-inline: auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 1rem;
}

@media (min-width: 1024px) {
  .fee-profiles-page {
    padding: 0;
  }
}
</style>
