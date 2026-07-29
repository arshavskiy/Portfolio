<script setup>
import {computed} from 'vue'
import {NConfigProvider, NSelect, darkTheme} from 'naive-ui'
import {useI18n} from '@/composables/useI18n'
import {useTheme} from '@/composables/useTheme'
import {supportedLocales} from '@/i18n/messages'

const {locale, setLocale, t} = useI18n()
const {isLight} = useTheme()
const naiveTheme = computed(() => (isLight.value ? null : darkTheme))

const languageOptions = computed(() =>
    supportedLocales.map((option) => ({
      label: option.shortLabel,
      value: option.code
    }))
)

const selectThemeOverrides = {
  peers: {
    InternalSelection: {
      border: 'none',
      borderActive: 'none',
      borderFocus: 'none',
      borderHover: 'none',
      boxShadowActive: 'none',
      boxShadowFocus: 'none',
      color: 'transparent',
      colorActive: 'transparent',
      heightSmall: '28px',
      textColor: 'var(--text-primary)',
      arrowColor: 'var(--text-secondary)'
    },
    InternalSelectMenu: {
      color: 'var(--bg-card)',
      borderRadius: '8px',
      boxShadow: 'var(--shadow-lg)',
      optionTextColor: 'var(--text-secondary)',
      optionTextColorActive: 'var(--text-primary)',
      optionTextColorPressed: 'var(--text-primary)',
      optionCheckColor: 'var(--accent)',
      optionColorActive: 'color-mix(in srgb, var(--accent) 14%, transparent)',
      optionColorPending: 'color-mix(in srgb, var(--accent) 10%, transparent)'
    }
  }
}
</script>

<template>
  <div class="language-select" :aria-label="t('common.language')">
    <NConfigProvider :theme="naiveTheme">
      <NSelect
          class="language-n-select"
          :value="locale"
          :options="languageOptions"
          :theme-overrides="selectThemeOverrides"
          size="small"
          :consistent-menu-width="false"
          @update:value="setLocale"
      />
    </NConfigProvider>
  </div>
</template>

<style scoped>
.language-select {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  min-width: 78px;
  padding: 0 0.3rem 0 0.45rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-card) 85%, transparent);
  color: var(--text-secondary);
  font: inherit;
}

.language-n-select {
  width: 60px;
  --n-height: 28px;
  --n-border: none;
  --n-border-hover: none;
  --n-border-active: none;
  --n-border-focus: none;
  --n-box-shadow-active: none;
  --n-box-shadow-focus: none;
  --n-color: transparent;
  --n-color-active: transparent;
  --n-text-color: var(--text-primary);
  --n-placeholder-color: var(--text-secondary);
  --n-caret-color: var(--text-secondary);
  --n-arrow-color: var(--text-secondary);
  --n-font-size: 0.78rem;
}

.language-n-select :deep(.n-base-selection) {
  background: transparent;
  font-weight: 800;
}

.language-n-select :deep(.n-base-selection .n-base-selection__border),
.language-n-select :deep(.n-base-selection .n-base-selection__state-border) {
  display: none;
}

.language-n-select :deep(.n-base-selection-label) {
  padding-left: 0;
  padding-right: 18px;
  color: var(--text-primary);
}

.language-n-select :deep(.n-base-selection-input) {
  color: var(--text-primary);
  font-size: 0.78rem;
  font-weight: 800;
  min-width: 30px;
}

.language-n-select :deep(.n-base-selection-input__content) {
  display: inline-block;
  min-width: 24px;
  overflow: visible;
  color: var(--text-primary);
  font-weight: 800;
}

.language-n-select :deep(.n-base-suffix) {
  right: 0;
}
</style>
