import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Button } from '@/components/ui/button'
import { sendResetCode, checkResetCode, resetPassword } from '@/api/auth'
import { ApiError } from '@/api/client'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { resolveLogoUrl } from '@/hooks/useBranding'

type Step = 'email' | 'code' | 'reset' | 'done'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const { branding } = useBrandingContext()
  const logoUrl = resolveLogoUrl(branding?.logo_url)

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSendCode(e: FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await sendResetCode(email)
      setStep('code')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError(t('error_generic'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError(t('forgot_error_passwords'))
      return
    }
    if (newPassword.length < 8) {
      setError(t('forgot_error_short'))
      return
    }

    setIsLoading(true)
    try {
      await resetPassword(email, code, newPassword)
      setStep('done')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError(t('error_generic'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[hsl(var(--background))]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {logoUrl && (
            <img src={logoUrl} alt={branding?.brand_name} className="h-16 w-16 object-contain mx-auto mb-3" />
          )}
          <h1 className="text-3xl font-extrabold text-[hsl(var(--primary))]">
            {branding?.brand_name ?? 'VPN'}
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{t('personal_cabinet')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('forgot_title')}</CardTitle>
            <CardDescription>
              {step === 'email' && t('forgot_email_step')}
              {step === 'code' && t('forgot_code_step')}
              {step === 'reset' && t('forgot_password_step')}
              {step === 'done' && t('forgot_done_step')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && (
              <div className="rounded-[var(--radius)] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            {step === 'email' && (
              <form onSubmit={handleSendCode} className="flex flex-col gap-3">
                <Input
                  label="Email"
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <Button type="submit" isLoading={isLoading} className="w-full">
                  {t('forgot_get_code')}
                </Button>
              </form>
            )}

            {step === 'code' && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  setError('')
                  setIsLoading(true)
                  try {
                    await checkResetCode(email, code)
                    setStep('reset')
                  } catch (err) {
                    if (err instanceof ApiError) {
                      setError(err.message)
                    } else {
                      setError(t('error_generic'))
                    }
                  } finally {
                    setIsLoading(false)
                  }
                }}
                className="flex flex-col gap-3"
              >
                <div className="rounded-[var(--radius)] bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700">
                  {t('forgot_email_hint', { email })}
                </div>
                <Input
                  label={t('forgot_code_label')}
                  id="code"
                  type="text"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
                <Button type="submit" isLoading={isLoading} className="w-full">
                  {t('forgot_next')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setStep('email')
                    setError('')
                    setCode('')
                  }}
                >
                  {t('forgot_change_email')}
                </Button>
              </form>
            )}

            {step === 'reset' && (
              <form onSubmit={handleReset} className="flex flex-col gap-3">
                <PasswordInput
                  label={t('forgot_new_password')}
                  id="new-password"
                  placeholder={t('forgot_password_hint')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <PasswordInput
                  label={t('forgot_confirm_password')}
                  id="confirm-password"
                  placeholder={t('forgot_repeat_password')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <Button type="submit" isLoading={isLoading} className="w-full">
                  {t('forgot_save')}
                </Button>
              </form>
            )}

            {step === 'done' && (
              <div className="flex flex-col gap-3">
                <div className="rounded-[var(--radius)] bg-green-50 border border-green-200 px-3 py-3 text-sm text-green-700 text-center">
                  {t('forgot_password_changed')}
                </div>
                <Button className="w-full" onClick={() => navigate('/login')}>
                  {t('forgot_login')}
                </Button>
              </div>
            )}

            {step !== 'done' && (
              <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
                {t('forgot_remember')}{' '}
                <Link to="/login" className="text-[hsl(var(--primary))] hover:underline font-medium">
                  {t('forgot_login')}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
