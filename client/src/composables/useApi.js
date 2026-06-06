import {resolveClientApiBase} from '@/config/api'

const BASE = resolveClientApiBase(import.meta.env.VITE_API_URL)

function getToken() {
  return localStorage.getItem('token')
}

async function fetchRequest(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
    return
  }

  const raw = await res.text()
  const contentType = res.headers.get('content-type') || ''
  let data = null

  if (raw) {
    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(raw)
      } catch {
        data = raw
      }
    } else {
      try {
        data = JSON.parse(raw)
      } catch {
        data = raw
      }
    }
  }

  if (!res.ok) {
    const message = typeof data === 'string' ? data : data?.message
    throw new Error(message || `Request failed (${res.status})`)
  }

  return data
}

async function request(method, path, body) {
  return fetchRequest(method, path, body)
}

export default {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  delete: (path) => request('DELETE', path),
  put: (path, body) => request('PUT', path, body),
}
