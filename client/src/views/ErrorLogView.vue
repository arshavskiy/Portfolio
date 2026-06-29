<script setup>
import {computed, onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import api from '@/composables/useApi'
import Button from 'primevue/button'
import Select from 'primevue/select'
import AppLoader from '@/components/ui/AppLoader.vue'

const router = useRouter()
const loading = ref(true)
const forbidden = ref(false)
const errors = ref([])
const statusFilter = ref(null)

const statusOptions = [
  {label: 'All statuses', value: null},
  {label: '429 — Too many requests', value: 429},
  {label: '400 — Bad request', value: 400},
  {label: '401 — Unauthorized', value: 401},
  {label: '403 — Forbidden', value: 403},
  {label: '404 — Not found', value: 404},
  {label: '500 — Server error', value: 500},
]

async function load() {
  loading.value = true
  forbidden.value = false
  try {
    const q = statusFilter.value ? `?status=${statusFilter.value}` : ''
    const data = await api.get(`/errors${q}`)
    errors.value = data.errors || []
  } catch (err) {
    if (err?.status === 403) forbidden.value = true
    errors.value = []
  } finally {
    loading.value = false
  }
}

const grouped = computed(() => errors.value)

function statusClass(status) {
  if (status === 429) return 'st-warn'
  if (status >= 500) return 'st-error'
  if (status >= 400) return 'st-danger'
  return 'st-muted'
}

function formatTime(d) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
  })
}

onMounted(load)
</script>

<template>
  <div class="errlog safe-bottom">
    <header class="page-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()"/>
      <h1 class="gradient-title">Error Log</h1>
      <Button class="refresh-btn" icon="pi pi-refresh" text rounded :disabled="loading" @click="load"/>
    </header>

    <div v-if="loading" class="page-loader">
      <AppLoader/>
    </div>

    <div v-else-if="forbidden" class="empty">
      <i class="pi pi-lock"/>
      <p class="text-muted">This page is for administrators only.</p>
    </div>

    <template v-else>
      <div class="filters">
        <Select
            v-model="statusFilter"
            :options="statusOptions"
            option-label="label"
            option-value="value"
            size="small"
            @change="load"
        />
        <span class="count text-muted">{{ errors.length }} entries</span>
      </div>

      <div v-if="!errors.length" class="empty">
        <i class="pi pi-check-circle"/>
        <p class="text-muted">No errors logged.</p>
      </div>

      <div v-else class="err-list">
        <div v-for="e in grouped" :key="e._id" class="err-row">
          <div class="err-top">
            <span class="err-status" :class="statusClass(e.status)">{{ e.status ?? '—' }}</span>
            <span class="err-route text-muted">{{ e.method }} {{ e.path }}</span>
            <span class="err-time text-muted">{{ formatTime(e.createdAt) }}</span>
          </div>
          <div class="err-msg">{{ e.message || '—' }}</div>
          <div class="err-meta text-muted">
            <span>{{ e.source }}</span>
            <span v-if="e.user">· {{ e.user.email }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.errlog { padding: 1rem; }
@media (min-width: 768px) { .errlog { padding: 1.5rem; max-width: 720px; margin: 0 auto; } }

.page-header { display: flex; align-items: center; gap: 0.25rem; margin-bottom: 1rem; }
.refresh-btn { margin-left: auto; }

.filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.count { font-size: 0.8rem; }

.err-list { display: flex; flex-direction: column; gap: 0.5rem; }

.err-row {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.7rem 0.85rem;
}

.err-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  margin-bottom: 0.3rem;
}

.err-status {
  font-weight: 700;
  font-size: 0.75rem;
  padding: 1px 7px;
  border-radius: 5px;
}
.st-warn { background: rgba(250, 204, 21, 0.15); color: #facc15; }
.st-danger { background: rgba(255, 51, 102, 0.15); color: #ff3366; }
.st-error { background: rgba(239, 68, 68, 0.18); color: #ef4444; }
.st-muted { background: rgba(148, 163, 184, 0.15); color: var(--text-secondary); }

.err-route { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.err-time { flex-shrink: 0; }

.err-msg { font-size: 0.85rem; word-break: break-word; }
.err-meta { font-size: 0.72rem; margin-top: 0.3rem; display: flex; gap: 0.35rem; }
</style>
