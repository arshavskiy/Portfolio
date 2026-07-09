<script setup>
import {useI18n} from '@/composables/useI18n'

const {locale, setLocale, t} = useI18n()

function toggleLocale() {
  setLocale(locale.value === 'ru' ? 'en' : 'ru')
}
</script>

<template>
  <button
      :aria-label="t('common.language')"
      class="language-toggle"
      type="button"
      @click="toggleLocale"
  >
    <i class="pi pi-language"/>
    <span class="toggle-track">
      <span :class="{active: locale === 'en'}" class="toggle-option">EN</span>
      <span :class="{active: locale === 'ru'}" class="toggle-option">RU</span>
      <span :class="{right: locale === 'ru'}" class="toggle-thumb"/>
    </span>
  </button>
</template>

<style scoped>
.language-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 34px;
  padding: 0 0.45rem 0 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-card) 85%, transparent);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
}

.language-toggle i {
  font-size: 0.9rem;
}

.toggle-track {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 58px;
  height: 24px;
  padding: 2px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
}

.toggle-option {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  font-size: 0.68rem;
  font-weight: 800;
  opacity: 0.55;
  transition: color 0.16s ease, opacity 0.16s ease;
}

.toggle-option.active {
  color: #fff;
  opacity: 1;
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(50% - 2px);
  height: calc(100% - 4px);
  border-radius: 5px;
  background: var(--accent);
  transition: transform 0.18s ease;
}

.toggle-thumb.right {
  transform: translateX(100%);
}
</style>
