<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'

const router = useRouter()
const toast = useToast()
const auth = useAuthStore()

const name = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  try {
    await auth.register(name.value, email.value, password.value)
    router.push('/')
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Registration failed', detail: err.message, life: 3000 })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-logo">
        <i class="pi pi-chart-line" />
        <h1>StockFolio</h1>
      </div>
      <h2>Create your account</h2>
      <form @submit.prevent="submit" class="auth-form">
        <div class="field">
          <label>Name</label>
          <InputText v-model="name" placeholder="Your name" required fluid />
        </div>
        <div class="field">
          <label>Email</label>
          <InputText v-model="email" type="email" placeholder="you@example.com" required fluid />
        </div>
        <div class="field">
          <label>Password</label>
          <Password v-model="password" toggleMask placeholder="Min 6 characters" required fluid />
        </div>
        <Button type="submit" label="Create Account" :loading="loading" fluid />
      </form>
      <p class="auth-footer">
        Already have an account? <RouterLink to="/login">Sign in</RouterLink>
      </p>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: var(--bg-primary);
}
.auth-card {
  width: 100%;
  max-width: 400px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2rem;
}
.auth-logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}
.auth-logo i { font-size: 28px; color: var(--accent); }
.auth-logo h1 { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
h2 { font-size: 1.1rem; color: var(--text-secondary); margin-bottom: 1.5rem; }
.auth-form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label { font-size: 0.85rem; color: var(--text-secondary); }
.auth-footer { margin-top: 1.5rem; text-align: center; color: var(--text-secondary); font-size: 0.9rem; }
.auth-footer a { color: var(--accent); text-decoration: none; }
</style>
