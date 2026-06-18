import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/composables/useApi'

export const useFeeProfileStore = defineStore('feeProfiles', () => {
  const profiles = ref([])
  const loading = ref(false)

  async function fetchProfiles() {
    loading.value = true
    try {
      profiles.value = await api.get('/fee-profiles')
    } finally {
      loading.value = false
    }
  }

  async function createProfile(payload) {
    const p = await api.post('/fee-profiles', payload)
    if (p.isDefault) {
      profiles.value = profiles.value.map((x) =>
        (x.currency || 'USD') === (p.currency || 'USD') ? {...x, isDefault: false} : x
      )
    }
    profiles.value.unshift(p)
    return p
  }

  async function updateProfile(id, payload) {
    const p = await api.put(`/fee-profiles/${id}`, payload)
    if (p.isDefault) {
      profiles.value = profiles.value.map((x) =>
        x._id !== id && (x.currency || 'USD') === (p.currency || 'USD') ? {...x, isDefault: false} : x
      )
    }
    const idx = profiles.value.findIndex((x) => x._id === id)
    if (idx !== -1) profiles.value[idx] = p
    return p
  }

  async function deleteProfile(id) {
    await api.delete(`/fee-profiles/${id}`)
    profiles.value = profiles.value.filter((x) => x._id !== id)
  }

  return { profiles, loading, fetchProfiles, createProfile, updateProfile, deleteProfile }
})
