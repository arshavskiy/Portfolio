<script setup>
import {onMounted, watch} from 'vue'
import {useBreakpoint} from '@/composables/useBreakpoint'
import {useWhatsNew} from '@/composables/useWhatsNew'
import {useTour, setTourBlocked} from '@/composables/useTour'
import MobileLayout from '@/layouts/MobileLayout.vue'
import DesktopLayout from '@/layouts/DesktopLayout.vue'
import WhatsNewModal from '@/components/ui/WhatsNewModal.vue'
import TrialWelcomeModal from '@/components/ui/TrialWelcomeModal.vue'
import AccountShortcut from '@/components/ui/AccountShortcut.vue'
import AccountModal from '@/components/ui/AccountModal.vue'
import SettingsModal from '@/components/ui/SettingsModal.vue'
import AboutModal from '@/components/ui/AboutModal.vue'
import {useAuthStore} from '@/stores/auth'
import {ref, computed} from 'vue'

const {isDesktop} = useBreakpoint()
const {checkForUpdates, visible: whatsNewVisible} = useWhatsNew()
const {maybeStartNavPhase} = useTour()
const showAccount = ref(false)
const showSettings = ref(false)
const settingsFromAccount = ref(false)
const showAbout = ref(false)
const auth = useAuthStore()

function openSettingsFromAccount() {
  settingsFromAccount.value = true
  showSettings.value = true
}

function openSettingsStandalone() {
  settingsFromAccount.value = false
  showSettings.value = true
}

const trialModalVisible = computed(() =>
  Boolean(auth.user && auth.user.trialEndsAt && !auth.user.welcomeModalSeenAt)
)

const anyBlockingModalVisible = computed(() => whatsNewVisible.value || trialModalVisible.value)

onMounted(() => {
  checkForUpdates()
  setTourBlocked(anyBlockingModalVisible.value)
  // Auto-tour defers to the What's New / trial-welcome modals, but ?tour always forces it.
  maybeStartNavPhase({blocked: anyBlockingModalVisible.value})
})

watch(anyBlockingModalVisible, (blocked, wasBlocked) => {
  setTourBlocked(blocked)
  if (!blocked && wasBlocked) maybeStartNavPhase()
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
  <DesktopLayout
      v-if="isDesktop"
      @open-account="showAccount = true"
      @open-settings="openSettingsStandalone"
  />
  <MobileLayout v-else/>
  <AccountShortcut @click="showAccount = true"/>
  <AccountModal
      v-model:visible="showAccount"
      @open-settings="openSettingsFromAccount"
      @open-about="showAbout = true"
  />
  <SettingsModal
      v-model:visible="showSettings"
      :from-account="settingsFromAccount"
      @back-to-account="showAccount = true"
  />
  <AboutModal
      v-model:visible="showAbout"
      from-account
      @back-to-account="showAccount = true"
  />
  <WhatsNewModal/>
  <TrialWelcomeModal/>
</template>
