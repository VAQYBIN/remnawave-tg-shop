import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { useAuth } from '@/auth/useAuth'
import { registerSendCode, registerCheckCode, registerVerify } from '@/api/auth'
import { ApiError } from '@/api/client'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { resolveLogoUrl } from '@/hooks/useBranding'
import type { PublicBrandingResponse } from '@/api/admin/branding'

type Step = 'email' | 'code' | 'password'

function ConsentText({ branding }: { branding: PublicBrandingResponse | undefined }) {
  const { t } = useTranslation()

  const hasTerms = !!branding?.terms_of_service_url
  const hasPrivacy = !!branding?.privacy_policy_url
  const hasPersonal = !!branding?.personal_data_url
  const hasReadDocs = hasTerms || hasPrivacy

  if (!hasTerms && !hasPrivacy && !hasPersonal) return null

  const docLink = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[hsl(var(--primary))] hover:underline">
      {label}
    </a>
  )

  const readParts = [
    hasTerms && docLink('/legal/terms', t('register_consent_terms')),
    hasPrivacy && docLink('/legal/privacy', t('register_consent_privacy')),
  ].filter(Boolean) as React.ReactNode[]

  const joinedRead =
    readParts.length === 2
      ? <>{readParts[0]}{' '}{t('register_consent_and')}{' '}{readParts[1]}</>
      : readParts[0]

  return (
    <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
      {t('register_consent_prefix')}{' '}
      {hasReadDocs && <>{t('register_consent_read')}{' '}{joinedRead}</>}
      {hasPersonal && (
        <>
          {hasReadDocs
            ? t('register_consent_also_personal')
            : t('register_consent_only_personal')}
          {' '}{docLink('/legal/personal-data', t('register_consent_personal_data'))}
        </>
      )}
      {'.'}
    </p>
  )
}

export function RegisterPage() {
  const { setAuth } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const { branding } = useBrandingContext()
  const logoUrl = resolveLogoUrl(branding?.logo_url)

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSendCode(e: FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await registerSendCode(email)
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

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('register_error_passwords'))
      return
    }
    if (password.length < 8) {
      setError(t('register_error_short'))
      return
    }

    setIsLoading(true)
    try {
      const resp = await registerVerify(email, code, password)
      setAuth(resp)
      navigate('/dashboard', { replace: true })
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
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-[hsl(var(--background))]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {logoUrl && (
            <img src={logoUrl} alt={branding?.brand_name} className="h-16 w-16 object-contain mx-auto mb-3 rounded-2xl" />
          )}
          <h1 className="text-3xl font-extrabold text-[hsl(var(--primary))]">
            {branding?.brand_name ?? ''}
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{t('personal_cabinet')}</p>
        </div>

        <Card className="shadow-[var(--shadow-md)]">
          <CardHeader>
            <CardTitle>{t('register_title')}</CardTitle>
            <CardDescription>
              {step === 'email' && t('register_email_step')}
              {step === 'code' && t('register_code_step')}
              {step === 'password' && t('register_password_step')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && <Alert variant="danger">{error}</Alert>}

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
                  {t('register_get_code')}
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
                    await registerCheckCode(email, code)
                    setStep('password')
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
                <Alert variant="info">{t('register_email_sent', { email })}</Alert>
                <Input
                  label={t('register_code_label')}
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
                  {t('register_next')}
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
                  {t('register_change_email')}
                </Button>
              </form>
            )}

            {step === 'password' && (
              <form onSubmit={handleVerify} className="flex flex-col gap-3">
                <PasswordInput
                  label={t('register_password')}
                  id="password"
                  placeholder={t('register_password_hint')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <PasswordInput
                  label={t('register_confirm_password')}
                  id="confirm-password"
                  placeholder={t('register_repeat_password')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <ConsentText branding={branding} />
                <Button type="submit" isLoading={isLoading} className="w-full">
                  {t('register_create')}
                </Button>
              </form>
            )}

            <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
              {t('register_have_account')}{' '}
              <Link to="/login" className="text-[hsl(var(--primary))] hover:underline font-medium">
                {t('register_login')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
