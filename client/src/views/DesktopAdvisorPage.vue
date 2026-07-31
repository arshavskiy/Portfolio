<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Dialog from 'primevue/dialog'
import ToggleSwitch from 'primevue/toggleswitch'
import AskPortfolioPanel from '@/components/ui/AskPortfolioPanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useAiChatStore } from '@/stores/aiChat'
import { useI18n } from '@/composables/useI18n'

const auth = useAuthStore()
const aiChat = useAiChatStore()
const { messages } = storeToRefs(aiChat)
const { t } = useI18n()

const advisorPanelRef = ref(null)
const showConsentModal = ref(false)
const consentDraft = ref(false)
const savingConsent = ref(false)

const aiDataSharingConsent = computed(() => auth.user?.aiDataSharingConsent === true)
const consentDirty = computed(() => consentDraft.value !== aiDataSharingConsent.value)

const suggestionPrompts = [
  'What would happen to my portfolio if the market drops 30% tomorrow?',
  'Which holdings are carrying the most concentration risk?',
  'How should I rebalance while keeping upside potential?',
  'Which watchlist names look most interesting today?',
]

function openConsentModal() {
  consentDraft.value = aiDataSharingConsent.value
  showConsentModal.value = true
}

function closeConsentModal() {
  showConsentModal.value = false
  consentDraft.value = aiDataSharingConsent.value
}

async function saveConsentModal() {
  if (!consentDirty.value) return
  savingConsent.value = true
  try {
    await auth.updatePreferences({ aiDataSharingConsent: consentDraft.value })
    showConsentModal.value = false
  } catch {
  } finally {
    savingConsent.value = false
  }
}

function toggleAdvisorHistory() {
  advisorPanelRef.value?.toggleHistory?.()
}

async function startNewAdvisorSession() {
  await advisorPanelRef.value?.startNewSession?.()
}

function sendAdvisorPrompt(prompt) {
  advisorPanelRef.value?.sendPrompt?.(prompt)
}
</script>

<template>
  <div class="advisor-page">
    <div class="advisor-head">
      <div>
        <strong>{{ t('insights.advisorTitle') }}</strong>
        <span>{{ t('insights.advisorSubtitle') }}</span>
      </div>
      <div class="advisor-actions">
        <Button
          v-tooltip.bottom="t('insights.advisorOpenHistory')"
          class="advisor-action-btn"
          icon="pi pi-history"
          severity="secondary"
          text
          rounded
          type="button"
          @click="toggleAdvisorHistory"
        />
        <Button
          v-tooltip.bottom="t('insights.advisorSettings')"
          class="advisor-action-btn"
          icon="pi pi-cog"
          severity="secondary"
          text
          rounded
          type="button"
          @click="openConsentModal"
        />
        <Button
          v-tooltip.bottom="t('insights.advisorNewSession')"
          class="advisor-action-btn"
          icon="pi pi-plus"
          severity="secondary"
          text
          rounded
          type="button"
          @click="startNewAdvisorSession"
        />
      </div>
    </div>

    <div v-if="!messages.length" class="advisor-hero">
      <span class="advisor-hero-mark">
        <i class="pi pi-comments" />
      </span>
      <strong>{{ t('insights.advisorHeroTitle') }}</strong>
      <p v-if="aiDataSharingConsent">{{ t('insights.advisorHeroText') }}</p>
      <p v-else>{{ t('insights.advisorHeroTextNoConsent') }}</p>
      <Button
        class="advisor-hero-cta"
        :icon="aiDataSharingConsent ? 'pi pi-sparkles' : 'pi pi-shield'"
        :label="aiDataSharingConsent ? t('insights.advisorHeroCta') : t('insights.advisorHeroCtaNoConsent')"
        outlined
        @click="aiDataSharingConsent ? advisorPanelRef?.focusInput?.() : openConsentModal()"
      />
    </div>

    <AskPortfolioPanel
      v-if="aiDataSharingConsent"
      ref="advisorPanelRef"
      class="advisor-panel"
    />

    <div v-if="aiDataSharingConsent" class="suggestions">
      <span>{{ t('insights.advisorSuggestions') }}</span>
      <Button
        v-for="prompt in suggestionPrompts"
        :key="prompt"
        class="suggestion-btn"
        severity="secondary"
        text
        :label="prompt"
        @click="sendAdvisorPrompt(prompt)"
      />
    </div>

    <Dialog
      v-model:visible="showConsentModal"
      :draggable="false"
      :style="{ width: '95vw', maxWidth: '560px' }"
      modal
      @hide="closeConsentModal"
    >
      <template #header>
        <div class="consent-dialog-title">
          <i class="pi pi-sparkles" />
          <div>
            <strong>{{ t('insights.consentTitle') }}</strong>
            <span>{{ t('insights.consentSubtitle') }}</span>
          </div>
        </div>
      </template>
      <Card class="consent-card">
        <template #content>
          <div class="consent-toggle-row">
            <div class="consent-switch-wrap">
              <ToggleSwitch v-model="consentDraft" />
            </div>
            <div class="consent-copy">
              <strong>{{ t('insights.consentToggleLabel') }}</strong>
              <p>{{ t('insights.consentToggleText') }}</p>
            </div>
          </div>
        </template>
      </Card>
      <template #footer>
        <div class="consent-footer">
          <Button :label="t('common.cancel')" outlined @click="closeConsentModal" />
          <Button
            :disabled="!consentDirty || savingConsent"
            :loading="savingConsent"
            :label="t('transactions.saveChanges')"
            @click="saveConsentModal"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.advisor-page {
  --desktop-surface: var(--bg-primary);
  --desktop-panel: var(--bg-secondary);
  --desktop-card: var(--bg-card);
  --desktop-border: var(--border);
  --desktop-text: var(--text-primary);
  --desktop-muted: var(--text-secondary);
  --desktop-hover: color-mix(in srgb, var(--text-primary) 6%, transparent);
  --desktop-elevated-shadow: 0 1px 2px color-mix(in srgb, var(--text-primary) 8%, transparent);

  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0.85rem 0.9rem;
  background: color-mix(in srgb, var(--desktop-panel) 90%, var(--desktop-surface));
  overflow: hidden;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.advisor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.65rem;
  flex-shrink: 0;
}

.advisor-head > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.advisor-head strong {
  font-size: 0.9rem;
}

.advisor-head span {
  color: var(--desktop-muted);
  font-size: 0.73rem;
}

.advisor-actions {
  display: flex;
  align-items: center;
  gap: 0.1rem;
  flex-shrink: 0;
}

.advisor-actions :deep(.advisor-action-btn.p-button) {
  color: var(--text-secondary);
  border: none;
  box-shadow: none;
}

.advisor-actions :deep(.advisor-action-btn.p-button:hover) {
  color: var(--text-primary);
}

.advisor-panel {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.advisor-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 1rem 0.95rem;
  text-align: center;
  flex-shrink: 0;
}

.advisor-hero-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: var(--desktop-panel);
  border: 1px solid var(--desktop-border);
  color: var(--desktop-muted);
  box-shadow: var(--desktop-elevated-shadow);
}

.advisor-hero-mark i { font-size: 1rem; }

.advisor-hero strong {
  font-size: 0.98rem;
  font-weight: 750;
  color: var(--desktop-text);
}

.advisor-hero p {
  margin: 0;
  max-width: 320px;
  color: var(--desktop-muted);
  font-size: 0.78rem;
  line-height: 1.45;
}

.advisor-hero-cta { margin-top: 0.15rem; }

.advisor-hero-cta :deep(.p-button) { min-height: 34px; }

.advisor-hero-cta :deep(.p-button-label) {
  font-size: 0.78rem;
  font-weight: 700;
}

.suggestions {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding-top: 0.5rem;
  flex-shrink: 0;
}

.suggestions > span {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--desktop-muted);
  padding: 0 0.25rem 0.2rem;
}

.suggestion-btn :deep(.p-button-label) {
  font-size: 0.78rem;
  font-weight: 500;
  text-align: left;
  white-space: normal;
  color: var(--desktop-text);
}

.consent-dialog-title {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.consent-dialog-title i {
  font-size: 1rem;
  color: var(--desktop-text);
  margin-top: 0.15rem;
}

.consent-dialog-title div {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.consent-dialog-title strong {
  font-size: 1.05rem;
  line-height: 1.15;
  color: var(--desktop-text);
}

.consent-dialog-title span {
  color: var(--desktop-muted);
  font-size: 0.86rem;
  line-height: 1.4;
}

.consent-card { overflow: hidden; }

.consent-card :deep(.p-card-body) { padding: 1rem; }

.consent-card :deep(.p-card-content) { padding: 0; }

.consent-toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
}

.consent-switch-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  min-width: 36px;
  min-height: 28px;
  padding-top: 0.1rem;
}

.consent-switch-wrap :deep(.p-toggleswitch) { flex-shrink: 0; }

.consent-copy {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.consent-copy strong {
  font-size: 0.95rem;
  color: var(--desktop-text);
}

.consent-copy p {
  margin: 0;
  color: var(--desktop-muted);
  font-size: 0.9rem;
  line-height: 1.45;
}

.consent-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
  width: 100%;
}
</style>
