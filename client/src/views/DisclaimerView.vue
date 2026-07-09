<script setup>
import {useRouter} from 'vue-router'
import Button from 'primevue/button'
import {useI18n} from '@/composables/useI18n'

const router = useRouter()
const {t} = useI18n()
</script>

<template>
  <div class="disclaimer safe-bottom">
    <header class="page-header">
      <div class="title-row">
        <Button icon="pi pi-arrow-left" text rounded class="back-btn" @click="router.back()" />
        <h1 class="gradient-title">{{ t('disclaimerPage.title') }}</h1>
      </div>
      <p class="eyebrow">{{ t('disclaimerPage.eyebrow') }}</p>
      <p class="intro">
        {{ t('disclaimerPage.intro') }}
      </p>
    </header>

    <section class="notice">
      <i class="pi pi-exclamation-triangle"/>
      <div>
        <h2>{{ t('disclaimerPage.notAdviceTitle') }}</h2>
        <p>
          {{ t('disclaimerPage.notAdviceText') }}
        </p>
      </div>
    </section>

    <section class="disclaimer-grid">
      <article class="disclaimer-card">
        <h2>{{ t('disclaimerPage.riskTitle') }}</h2>
        <p>
          {{ t('disclaimerPage.riskText') }}
        </p>
      </article>

      <article class="disclaimer-card">
        <h2>{{ t('disclaimerPage.dataTitle') }}</h2>
        <p>
          {{ t('disclaimerPage.dataText') }}
        </p>
      </article>

      <article class="disclaimer-card">
        <h2>{{ t('disclaimerPage.responsibilityTitle') }}</h2>
        <p>
          {{ t('disclaimerPage.responsibilityText') }}
        </p>
      </article>

      <article class="disclaimer-card">
        <h2>{{ t('disclaimerPage.guaranteesTitle') }}</h2>
        <p>
          {{ t('disclaimerPage.guaranteesText') }}
        </p>
      </article>
    </section>

    <p class="closing text-muted">
      {{ t('disclaimerPage.closing') }}
    </p>
  </div>
</template>

<style scoped>
.disclaimer {
  height: 100%;
  overflow-y: auto;
  padding: 1rem;
}

@media (min-width: 768px) {
  .disclaimer {
    max-width: 980px;
    margin: 0 auto;
    padding: 2rem;
  }
}

.page-header {
  margin-bottom: 1rem;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.back-btn {
  margin-left: -0.5rem;
}

.eyebrow {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin-bottom: 0.35rem;
  text-transform: uppercase;
}

.page-header h1 {
  font-size: 1.5rem;
  font-weight: 800;
}

.intro {
  color: var(--text-secondary);
  font-size: 0.98rem;
  line-height: 1.55;
  max-width: 760px;
}

.notice {
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.32);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.notice i {
  color: #f59e0b;
  font-size: 1.1rem;
  margin-top: 0.15rem;
}

.notice h2,
.disclaimer-card h2 {
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 800;
  margin-bottom: 0.4rem;
}

.notice p,
.disclaimer-card p {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.55;
}

.disclaimer-grid {
  display: grid;
  gap: 0.85rem;
}

@media (min-width: 780px) {
  .disclaimer-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.disclaimer-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
}

.closing {
  font-size: 0.82rem;
  line-height: 1.5;
  margin: 1rem 0 0;
}
</style>
