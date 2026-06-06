export const DEFAULT_API_PROXY_TARGET = 'http://localhost:3000'

export function normalizeApiBase(value) {
  if (!value) return ''
  const trimmed = value.replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

export function resolveClientApiBase(value) {
  return normalizeApiBase(value) || '/api'
}

export function resolveApiProxyTarget(value) {
  return value || DEFAULT_API_PROXY_TARGET
}
