import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import api from '@/composables/useApi'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || null)
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isAuthenticated = computed(() => !!token.value)
  const userType = computed(() => user.value?.userType || 'regular')
  const isRegularUser = computed(() => userType.value === 'regular')
  const canUsePremiumFeatures = computed(() => !isRegularUser.value)
  const isAdmin = computed(() => userType.value === 'admin')

  function setAuth(t, u) {
    token.value = t
    user.value = u
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }
    
    async function login(identifier, password) {
        const data = await api.post('/auth/login', {identifier, password})
    setAuth(data.token, data.user)
    return data
  }
    
    async function register(name, identifier, password) {
        const data = await api.post('/auth/register', {name, identifier, password})
    setAuth(data.token, data.user)
    return data
  }

  async function loginWithGoogle(credential) {
    const data = await api.post('/auth/google', { credential })
    setAuth(data.token, data.user)
    return data
  }

  async function loginWithMagicLink(magicToken) {
    const data = await api.post('/auth/magic-link', { token: magicToken })
    setAuth(data.token, data.user)
    return data
  }
    
    // Refresh the current user from the server (cached localStorage copy may be
    // missing/stale). Keeps token; updates user.
    async function fetchMe() {
        if (!token.value) return null
        const data = await api.get('/auth/me')
        if (data?.user) {
            user.value = data.user
            localStorage.setItem('user', JSON.stringify(data.user))
        }
        return user.value
    }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  async function updatePreferences(prefs) {
    const data = await api.put('/auth/me/preferences', prefs)
    if (data?.user) {
      user.value = data.user
      localStorage.setItem('user', JSON.stringify(data.user))
    }
    return user.value
  }

  async function dismissWelcomeModal() {
    const data = await api.post('/auth/me/welcome-modal-seen')
    if (data?.user) {
      user.value = data.user
      localStorage.setItem('user', JSON.stringify(data.user))
    }
    return user.value
  }

    return {
      token,
      user,
      isAuthenticated,
      userType,
      isRegularUser,
      canUsePremiumFeatures,
      isAdmin,
      login,
      register,
      loginWithGoogle,
      loginWithMagicLink,
      logout,
      fetchMe,
      updatePreferences,
      dismissWelcomeModal
    }
})
