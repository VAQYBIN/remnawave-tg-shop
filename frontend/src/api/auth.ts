import { apiRequest, API_BASE } from './client'

export interface TokenResponse {
  access_token: string
  token_type: string
  account_id: string
  email: string | null
  is_email_verified: boolean
  language_code: string
}

export interface MessageResponse {
  message: string
}

export async function getTelegramClientId(): Promise<{ client_id: number }> {
  return apiRequest<{ client_id: number }>('/auth/telegram/config')
}

export interface TelegramCallbackData {
  code: string
  code_verifier: string
  redirect_uri: string
}

export async function authTelegram(data: TelegramCallbackData): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function registerSendCode(email: string): Promise<MessageResponse> {
  return apiRequest<MessageResponse>('/auth/register/send-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function registerCheckCode(
  email: string,
  code: string,
): Promise<MessageResponse> {
  return apiRequest<MessageResponse>('/auth/register/check-code', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
}

export async function registerVerify(
  email: string,
  code: string,
  password: string,
  refCode?: string | null,
): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/auth/register/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code, password, ref_code: refCode || undefined }),
  })
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function sendResetCode(email: string): Promise<MessageResponse> {
  return apiRequest<MessageResponse>('/auth/password/send-reset-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function checkResetCode(
  email: string,
  code: string,
): Promise<MessageResponse> {
  return apiRequest<MessageResponse>('/auth/password/check-reset-code', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
}

export async function resetPassword(
  email: string,
  code: string,
  new_password: string,
): Promise<MessageResponse> {
  return apiRequest<MessageResponse>('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ email, code, new_password }),
  })
}

export async function refreshToken(): Promise<TokenResponse> {
  const resp = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!resp.ok) throw new Error('Refresh failed')
  return resp.json()
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
}
