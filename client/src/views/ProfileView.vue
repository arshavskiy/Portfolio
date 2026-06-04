<script setup>
import {ref} from 'vue'
import {useRouter} from 'vue-router'
import {useAuthStore} from '@/stores/auth'
import Button from 'primevue/button'
import Avatar from 'primevue/avatar'
import FeeProfilesModal from '@/components/ui/FeeProfilesModal.vue'

const router = useRouter()
const auth = useAuthStore()
const showFeeProfiles = ref(false)

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="profile">
    <header class="page-header">
      <h1 class="gradient-title">Profile</h1>
    </header>

    <div class="profile-card">
      <Avatar
        :label="auth.user?.name?.charAt(0)?.toUpperCase()"
        size="xlarge"
        shape="circle"
        style="background: var(--accent); color: #fff; font-size: 1.5rem;"
      />
      <div class="profile-info">
        <p class="profile-name">{{ auth.user?.name }}</p>
        <p class="profile-email text-muted">{{ auth.user?.email }}</p>
      </div>
    </div>

    <div class="menu-list">
      <div class="menu-item" @click="showFeeProfiles = true">
        <i class="pi pi-percentage" />
        <span>Fee Profiles</span>
        <i class="pi pi-chevron-right text-muted" />
      </div>
      <div class="menu-item" @click="router.push('/alerts')">
        <i class="pi pi-bell" />
        <span>Price Alerts</span>
        <i class="pi pi-chevron-right text-muted" />
      </div>
      <div class="menu-item">
        <i class="pi pi-cog" />
        <span>Settings</span>
        <i class="pi pi-chevron-right text-muted" />
      </div>
    </div>

    <Button
      label="Sign Out"
      severity="danger"
      outlined
      fluid
      icon="pi pi-sign-out"
      class="mt-4"
      @click="logout"
    />

    <FeeProfilesModal v-model:visible="showFeeProfiles" />
  </div>
</template>

<style scoped>
.profile { padding: 1rem; }
.page-header { margin-bottom: 1.5rem; }

.page-header h1 {
  font-size: 1.5rem;
}
.profile-card { display: flex; align-items: center; gap: 1rem; padding: 1.5rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; margin-bottom: 1.5rem; }
.profile-name { font-weight: 600; font-size: 1.1rem; }
.profile-email { font-size: 0.85rem; }
.menu-list { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 1.5rem; }
.menu-item { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; border-bottom: 1px solid var(--border); cursor: pointer; }
.menu-item:last-child { border-bottom: none; }
.menu-item span { flex: 1; }
.mt-4 { margin-top: 1rem; }
</style>
