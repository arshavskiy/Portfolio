<script setup>
import {computed, ref, watch} from 'vue'
import {useRouter} from 'vue-router'
import {useAuthStore} from '@/stores/auth'
import {useFullscreen, usePwaInstall} from '@/composables/usePwa'
import {useTour} from '@/composables/useTour'
import {useI18n} from '@/composables/useI18n'
import {useToast} from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import ToggleSwitch from 'primevue/toggleswitch'
import Textarea from 'primevue/textarea'
import LanguageSelect from '@/components/ui/LanguageSelect.vue'
import PremiumBadge from '@/components/ui/PremiumBadge.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'

const visible = defineModel('visible', {type: Boolean, default: false})
defineProps({
  fromAccount: {type: Boolean, default: false},
})
const emit = defineEmits(['back-to-account'])

const router = useRouter()

function backToAccount() {
  visible.value = false
  emit('back-to-account')
}
const toast = useToast()
const auth = useAuthStore()
const {t} = useI18n()

const {isFullscreen, supported: fsSupported, toggle: toggleFullscreen} = useFullscreen()
const {canInstall, installed, isIos, promptInstall} = usePwaInstall()
const {startNavPhase, resetTour} = useTour()

const userType = computed(() => auth.userType)
const canCustomizePrompt = computed(() => ['pro', 'max', 'admin'].includes(userType.value))

const aiSummaryEnabled = computed({
  get: () => auth.user?.aiDailySummaryEnabled !== false,
  set: (value) => {
    if (value) {
      localStorage.removeItem('daily-summary-dismissed-day')
      window.dispatchEvent(new Event('daily-summary:show'))
    }
    auth.updatePreferences({aiDailySummaryEnabled: value}).catch(() => {})
  },
})

const customPromptDraft = ref(auth.user?.aiDailySummaryCustomPrompt || '')
const customPromptSaving = ref(false)
watch(() => auth.user?.aiDailySummaryCustomPrompt, (value) => {
  customPromptDraft.value = value || ''
})

async function saveCustomPrompt() {
  if (customPromptDraft.value === (auth.user?.aiDailySummaryCustomPrompt || '')) return
  customPromptSaving.value = true
  try {
    await auth.updatePreferences({aiDailySummaryCustomPrompt: customPromptDraft.value})
  } catch {
    toast.add({severity: 'error', summary: t('account.customPromptSaveFailed'), life: 3000})
  } finally {
    customPromptSaving.value = false
  }
}

function replayTour() {
  visible.value = false
  resetTour()
  router.push('/').then(() => startNavPhase())
}

async function install() {
  if (canInstall.value) {
    const ok = await promptInstall()
    if (ok) toast.add({severity: 'success', summary: t('account.appInstalled'), life: 2000})
  } else if (isIos) {
    toast.add({
      severity: 'info',
      summary: t('account.addToHomeScreen'),
      detail: t('account.iosInstallDetail'),
      life: 5000,
    })
  } else {
    toast.add({
      severity: 'info',
      summary: t('account.install'),
      detail: t('account.browserInstallDetail'),
      life: 5000,
    })
  }
}
</script>

<template>
  <Dialog
      v-model:visible="visible"
      :draggable="false"
      :style="{ width: '95vw', maxWidth: '520px' }"
      modal
  >
    <template #header>
      <nav v-if="fromAccount" class="modal-crumbs">
        <button class="crumb-back" type="button" @click="backToAccount">
          <i class="pi pi-chevron-left"/>
          <span>{{ t('common.account') }}</span>
        </button>
        <span class="crumb-sep">›</span>
        <span class="gradient-title">{{ t('common.settings') }}</span>
      </nav>
      <span v-else class="gradient-title">{{ t('common.settings') }}</span>
    </template>

    <div class="settings">
      <div class="menu-list">
        <div class="menu-item theme-menu-item">
          <i class="pi pi-palette menu-icon"/>
          <span>{{ t('account.theme') }}</span>
          <ThemeToggle/>
        </div>
        <div class="menu-item language-menu-item">
          <i class="pi pi-language menu-icon"/>
          <span>{{ t('common.language') }}</span>
          <LanguageSelect/>
        </div>
      </div>

      <div class="menu-list">
        <div class="menu-item">
          <i class="pi pi-sparkles menu-icon"/>
          <span>{{ t('account.aiDailySummary') }}</span>
          <ToggleSwitch v-model="aiSummaryEnabled"/>
        </div>
        <button v-if="!installed" class="menu-item" @click="install">
          <i class="pi pi-download menu-icon"/>
          <span>{{ t('account.installApp') }}</span>
          <i class="pi pi-chevron-right text-muted"/>
        </button>
        <button v-if="fsSupported" class="menu-item" @click="toggleFullscreen">
          <i class="pi pi-window-maximize menu-icon"/>
          <span>{{ isFullscreen ? t('account.exitFullscreen') : t('account.fullscreen') }}</span>
          <i class="pi pi-chevron-right text-muted"/>
        </button>
        <button class="menu-item" @click="replayTour">
          <i class="pi pi-compass menu-icon"/>
          <span>{{ t('account.startTour') }}</span>
          <i class="pi pi-chevron-right text-muted"/>
        </button>
      </div>

      <div v-if="canCustomizePrompt" class="custom-prompt-card">
        <label class="custom-prompt-label" for="custom-prompt">
          <i class="pi pi-pencil menu-icon"/>
          {{ t('account.customPrompt') }}
          <PremiumBadge :label="t('common.premium')" :title="t('common.premiumFeature')" compact/>
        </label>
        <Textarea
            id="custom-prompt"
            v-model="customPromptDraft"
            :placeholder="t('account.customPromptPlaceholder')"
            autoResize
            class="custom-prompt-input"
            maxlength="500"
            rows="2"
            @blur="saveCustomPrompt"
        />
        <span class="custom-prompt-hint text-muted">{{ t('account.customPromptHint') }}</span>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.modal-crumbs {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.crumb-back {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.35rem;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}

.crumb-back:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--text-primary) 6%, transparent);
}

.crumb-back i {
  font-size: 0.7rem;
}

.crumb-sep {
  color: var(--text-secondary);
  font-size: 0.85rem;
  opacity: 0.45;
  user-select: none;
}

.settings {
  display: flex;
  flex-direction: column;
}

.menu-list {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 1.25rem;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.9rem 1rem;
  border: none;
  border-bottom: 1px solid var(--border);
  background: none;
  color: var(--text-primary);
  font-size: 0.92rem;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:active {
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
}

.menu-item span {
  flex: 1;
}

.menu-icon {
  color: var(--accent);
  font-size: 1rem;
}

.custom-prompt-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.9rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 0.5rem;
}

.custom-prompt-label {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  font-size: 0.92rem;
  font-weight: 600;
}

.custom-prompt-input {
  width: 100%;
  font-size: 0.85rem;
}

.custom-prompt-hint {
  font-size: 0.7rem;
}
</style>
