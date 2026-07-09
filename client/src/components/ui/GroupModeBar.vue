<script setup>
import {ref, watch} from 'vue'
import {GROUP_MODES} from '@/composables/useGrouping'
import {useI18n} from '@/composables/useI18n'

const model = defineModel({type: String, required: true})
const {t} = useI18n()
// 'down' = gainers first (default), 'up' = losers first. Meaningful while
// model === 'change', 'pre', or 'post'; clicking the already-active chip again
// flips it (next click toggles direction instead of needing a double-click).
const changeDirection = defineModel('changeDirection', {type: String, default: 'down'})
const directionalModes = new Set(['change', 'pre', 'post', 'extended', 'momentum'])
const validModes = new Set(GROUP_MODES.map((opt) => opt.value))
const MODE_ICONS = {
  market: 'pi pi-globe',
  change: 'pi pi-chart-line',
  extended: 'pi pi-clock',
  momentum: 'pi pi-bolt',
  industry: 'pi pi-building',
  group: 'pi pi-tags',
}

const MODE_EXPLANATIONS = {
  market: 'grouping.market',
  change: 'grouping.todayChange',
  extended: 'grouping.extended',
  momentum: 'grouping.momentum',
  industry: 'grouping.industry',
  group: 'grouping.tags',
}

const SEEN_KEY = 'group-mode-tooltips-seen'
const seenModes = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'))
const allSeen = ref(seenModes.size >= GROUP_MODES.length)

function markSeen(value) {
  if (allSeen.value || seenModes.has(value)) return
  seenModes.add(value)
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seenModes]))
  if (seenModes.size >= GROUP_MODES.length) allSeen.value = true
}

watch(model, (value) => {
  if (!validModes.has(value)) model.value = 'market'
}, {immediate: true})

function onTap(value) {
  markSeen(value)
  if (directionalModes.has(value) && model.value === value) {
    changeDirection.value = changeDirection.value === 'down' ? 'up' : 'down'
    return
  }
  // Reset direction to default when switching modes so momentum always starts bullish-first
  if (value !== model.value) changeDirection.value = 'down'
  model.value = value
}

function labelFor(opt) {
  const label = t(MODE_EXPLANATIONS[opt.value] || 'grouping.groupBy')
  return opt.title || (directionalModes.has(opt.value) ? t('grouping.clickAgain', {label}) : t('grouping.groupByLabel', {label}))
}

function iconFor(opt) {
  if (opt.value === 'momentum' && model.value === opt.value && changeDirection.value === 'up') return 'pi pi-bolt'
  return MODE_ICONS[opt.value] || 'pi pi-circle'
}
</script>

<template>
  <div :aria-label="t('grouping.groupBy')" class="group-bar">
    <button
      v-for="opt in GROUP_MODES"
      :key="opt.value"
      class="group-btn"
      :class="{
        active: model === opt.value,
        'btn-momentum': opt.value === 'momentum',
        'btn-directional-bull': directionalModes.has(opt.value) && model === opt.value && changeDirection === 'down',
        'btn-directional-bear': directionalModes.has(opt.value) && model === opt.value && changeDirection === 'up',
      }"
      v-tooltip.focus.bottom="allSeen ? null : t(MODE_EXPLANATIONS[opt.value])"
      :aria-label="labelFor(opt)"
      @click="onTap(opt.value)"
    >
      <i :class="iconFor(opt)" class="mode-icon"/>
      <i
          v-if="directionalModes.has(opt.value) && model === opt.value"
        :class="changeDirection === 'up' ? 'pi pi-arrow-down' : 'pi pi-arrow-up'"
        class="change-dir-icon"
      />
    </button>
  </div>
</template>

<style scoped>
.group-bar {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 2px;
  width: 100%;
  min-width: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2px;
}

.group-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  width: 100%;
  background: none;
  border: none;
  color: var(--text-secondary);
  border-radius: 6px;
  height: 28px;
  padding: 0;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.group-btn:active {
  background: rgba(255,255,255,0.05);
}

.group-btn.active {
  background: var(--accent);
  color: #fff;
}

.mode-icon {
  font-size: 0.82rem;
  line-height: 1;
}

.change-dir-icon {
  position: absolute;
  right: 2px;
  bottom: 2px;
  font-size: 0.44rem;
  line-height: 1;
}

.btn-momentum {
  color: #00c36a;
}

.btn-directional-bull.active {
  background: rgba(0, 195, 106, 0.2);
  color: #00c36a;
}

.btn-directional-bear.active {
  background: rgba(224, 45, 74, 0.2);
  color: #e02d4a;
}
</style>
