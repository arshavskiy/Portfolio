<script setup>
import {useRouter} from 'vue-router'
import Button from 'primevue/button'
import {useI18n} from '@/composables/useI18n'

const router = useRouter()
const {t} = useI18n()
</script>

<template>
  <div class="math safe-bottom">
    <header class="page-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <h1 class="gradient-title">{{ t('mathPage.title') }}</h1>
    </header>

    <p class="intro text-muted">
      {{ t('mathPage.intro') }}
    </p>

    <section v-for="s in t('mathPage.sections')" :key="s.title" class="math-card">
      <h2 class="math-title">{{ s.title }}</h2>

      <p v-if="s.intro" class="math-body">{{ s.intro }}</p>

      <div v-if="s.formula" class="math-formula">{{ s.formula }}</div>
      <div v-if="s.formula2" class="math-formula">{{ s.formula2 }}</div>

      <ul v-if="s.points" class="math-list">
        <li v-for="(item, i) in s.points" :key="i">{{ item }}</li>
      </ul>

      <p v-if="s.intro2" class="math-body">{{ s.intro2 }}</p>
    </section>
  </div>
</template>

<style scoped>
.math { padding: 1rem; }
@media (min-width: 768px) { .math { padding: 1.5rem; max-width: 640px; } }

.page-header { display: flex; align-items: center; gap: 0.25rem; margin-bottom: 1rem; }

.intro { font-size: 0.88rem; line-height: 1.5; margin-bottom: 1rem; }

.math-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.1rem 1.25rem;
  margin-bottom: 1rem;
}

.math-title { font-size: 1.02rem; font-weight: 700; margin-bottom: 0.6rem; }

.math-body { font-size: 0.85rem; line-height: 1.55; margin-bottom: 0.65rem; }

.math-formula {
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1.5;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 10px;
  padding: 0.7rem 0.9rem;
  margin-bottom: 0.65rem;
  color: var(--text-primary);
}

.math-list {
  list-style: disc;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: 0.83rem;
  line-height: 1.5;
}
</style>
