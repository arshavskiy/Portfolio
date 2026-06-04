import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import api from '@/composables/useApi'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || null)
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isAuthenticated = computed(() => !!token.value)

  function setAuth(t, u) {
    token.value = t
    user.value = u
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }

  async function login(email, password) {
    const data = await api.post('/auth/login', { email, password })
    setAuth(data.token, data.user)
    return data
  }

  async function register(name, email, password) {
    const data = await api.post('/auth/register', { name, email, password })
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
    
    return {token, user, isAuthenticated, login, register, logout, fetchMe}
})
