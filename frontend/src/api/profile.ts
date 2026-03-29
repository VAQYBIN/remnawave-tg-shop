import { apiRequest } from './client'

export interface Profile {
  account_id: string
  email: string | null
  is_email_verified: boolean
  language_code: string
  telegram_user_id: number | null
  telegram_username: string | null
  telegram_first_name: string | null
}

export function getProfile(): Promise<Profile> {
  return apiRequest<Profile>('/profile')
}

export function patchLanguage(language_code: string): Promise<{ language_code: string }> {
  return apiRequest('/profile/language', {
    method: 'PATCH',
    body: JSON.stringify({ language_code }),
  })
}

export function sendEmailChangeCode(new_email: string): Promise<{ message: string }> {
  return apiRequest('/profile/email/send-code', {
    method: 'POST',
    body: JSON.stringify({ new_email }),
  })
}

export function verifyEmailChange(
  new_email: string,
  code: string,
): Promise<{ message: string; email: string }> {
  return apiRequest('/profile/email/verify', {
    method: 'POST',
    body: JSON.stringify({ new_email, code }),
  })
}

export function linkTelegram(
  code: string,
  code_verifier: string,
  redirect_uri: string,
): Promise<{ message: string; telegram_user_id: number }> {
  return apiRequest('/profile/link-telegram', {
    method: 'POST',
    body: JSON.stringify({ code, code_verifier, redirect_uri }),
  })
}
