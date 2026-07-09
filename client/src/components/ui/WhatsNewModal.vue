<script setup>
import {useWhatsNew} from '@/composables/useWhatsNew'
import {useI18n} from '@/composables/useI18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'

const {visible, entries, dismiss} = useWhatsNew()
const {t} = useI18n()
</script>

<template>
  <Dialog
      :visible="visible"
      @update:visible="dismiss"
      modal
      :draggable="false"
      :style="{ width: '95vw', maxWidth: '420px' }"
  >
    <template #header>
      <div class="whats-new-header">
        <span class="sparkle">✨</span>
        <span class="gradient-title">{{ t('whatsNew.title') }}</span>
      </div>
    </template>

    <div class="entries">
      <section v-for="entry in entries" :key="entry.version" class="entry">
        <div class="entry-head">
          <h3 v-if="entry.title" class="entry-title">{{ entry.title }}</h3>
          <span class="entry-date">{{ entry.date }}</span>
        </div>
        <ul class="entry-changes">
          <li v-for="(change, i) in entry.changes" :key="i">
            <i class="pi pi-check"/>
            <span>{{ change }}</span>
          </li>
        </ul>
      </section>
    </div>

    <template #footer>
      <Button :label="t('whatsNew.gotIt')" fluid @click="dismiss"/>
    </template>
  </Dialog>
</template>

<style scoped>
.whats-new-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.15rem;
  font-weight: 800;
}

.sparkle {
  font-size: 1.1rem;
}

.entries {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.entry-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.entry-title {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0;
}

.entry-date {
  font-size: 0.7rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.entry-changes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.entry-changes li {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  font-size: 0.85rem;
  line-height: 1.4;
}

.entry-changes i {
  color: var(--neon-green, #00c36a);
  font-size: 0.75rem;
  margin-top: 0.2rem;
  flex-shrink: 0;
}
</style>
