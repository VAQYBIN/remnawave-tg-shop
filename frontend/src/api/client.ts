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
