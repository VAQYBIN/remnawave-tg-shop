declare global {
  interface Window { __ENV__?: { API_URL?: string } }
}

export const API_BASE =
  window.__ENV__?.API_URL ||
  (import.meta.env.VITE_API_URL as string) ||
  'http://localhost:8090/api'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// In-memory access token storage (never in localStorage)
let _accessToken: string | null = null
let _refreshing: Promise<string | null> | null = null

export function setAccessToken(token: string | null): void {
  _accessToken = token
}

export function getAccessToken(): string | null {
  return _accessToken
}

async function doRefresh(): Promise<string | null> {
  try {
    const resp = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!resp.ok) {
      setAccessToken(null)
      return null
    }
    const data = await resp.json()
    setAccessToken(data.access_token)
    return data.access_token as string
  } catch {
    setAccessToken(null)
    return null
  }
}

function refreshAccessToken(): Promise<string | null> {
  // Deduplicate concurrent refresh calls
  if (!_refreshing) {
    _refreshing = doRefresh().finally(() => {
      _refreshing = null
    })
  }
  return _refreshing
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`
  }

  let resp = await fetch(url, { ...options, headers, credentials: 'include' })

  if (resp.status === 401 && _accessToken) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      resp = await fetch(url, { ...options, headers, credentials: 'include' })
    }
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: 'Unknown error' }))
    throw new ApiError(resp.status, body.detail ?? 'Unknown error')
  }

  if (resp.status === 204) return undefined as T

  return resp.json() as Promise<T>
}

/** Multipart upload with auth + token refresh (apiRequest forces JSON, so we need this). */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const url = `${API_BASE}${path}`

  const buildHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {}
    if (_accessToken) h['Authorization'] = `Bearer ${_accessToken}`
    return h
  }

  let resp = await fetch(url, { method: 'POST', headers: buildHeaders(), credentials: 'include', body: form })

  if (resp.status === 401 && _accessToken) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${newToken}` },
        credentials: 'include',
        body: form,
      })
    }
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: 'Upload failed' }))
    throw new ApiError(resp.status, body.detail ?? 'Upload failed')
  }
  return resp.json() as Promise<T>
}

// API_BASE is like "https://api.domain.com/api" — strip the trailing /api for static assets
const API_ORIGIN = API_BASE.replace(/\/api$/, '')

/** Turn a relative /static/... attachment URL into an absolute API URL. */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('/static/')) return `${API_ORIGIN}${url}`
  return url
}
