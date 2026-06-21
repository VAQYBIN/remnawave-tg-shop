import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import {
  getProfile,
  patchLanguage,
  sendEmailChangeCode,
  verifyEmailChange,
  unlinkTelegram,
} from '@/api/profile'
import { getTelegramClientId } from '@/api/auth'
import { TELEGRAM_OAUTH_URL, TG_MODE_KEY, TG_PKCE_KEY, TG_STATE_KEY, generatePKCE, generateState } from '@/pages/LoginPage'
import { useToast } from '@/hooks/useToast'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { Mail, Send, Check, AlertCircle, Lock, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Field shell (label + input-like control) ─────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-[hsl(var(--foreground))]">{label}</label>
      {children}
    </div>
  )
}

function ReadonlyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3">
      {children}
    </div>
  )
}

// ─── Profile Page ─────────────────────────────────────────────────────────────

export function ProfilePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const handledProfileNotice = useRef(false)
  const { branding } = useBrandingContext()

  // Legal documents configured in Branding — shown as quick-access buttons.
  const legalDocs = [
    { url: branding?.terms_of_service_url, to: '/legal/terms', label: t('legal_terms_title') },
    { url: branding?.privacy_policy_url, to: '/legal/privacy', label: t('legal_privacy_title') },
    { url: branding?.personal_data_url, to: '/legal/personal-data', label: t('legal_personal_data_title') },
    { url: branding?.refund_policy_url, to: '/legal/refund', label: t('legal_refund_title') },
  ].filter((d) => !!d.url)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  })

  // ── Language ──────────────────────────────────────────────────────────────
  const langMutation = useMutation({
    mutationFn: (lang: string) => patchLanguage(lang),
    onSuccess: (_data, lang) => {
      i18n.changeLanguage(lang)
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
  const currentLang = i18n.language.startsWith('ru') ? 'ru' : 'en'

  // ── Email change ──────────────────────────────────────────────────────────
  const [emailOpen, setEmailOpen] = useState(false)
  const [step, setStep] = useState<'idle' | 'code'>('idle')
  const [newEmail, setNewEmail] = useState('')
  const [code, setCode] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const sendCode = useMutation({
    mutationFn: () => sendEmailChangeCode(newEmail),
    onSuccess: () => {
      setStep('code')
      setErrorMsg('')
    },
    onError: (err: Error) => setErrorMsg(err.message || t('profile_error_send')),
  })

  const verifyCode = useMutation({
    mutationFn: () => verifyEmailChange(newEmail, code),
    onSuccess: (data) => {
      toast.success(t('profile_email_updated', { email: data.email }))
      setEmailOpen(false)
      setStep('idle')
      setNewEmail('')
      setCode('')
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
    onError: (err: Error) => setErrorMsg(err.message || t('profile_error_code')),
  })

  function resetEmailFlow() {
    setEmailOpen(false)
    setStep('idle')
    setNewEmail('')
    setCode('')
    setErrorMsg('')
  }

  // ── Telegram link / unlink ──────────────────────────────────────────────────
  const isLinked = Boolean(profile?.telegram_user_id)

  const unlinkMutation = useMutation({
    mutationFn: unlinkTelegram,
    onSuccess: () => {
      toast.success(t('profile_telegram_unlinked'))
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
    onError: (err: Error) => toast.error(err.message || t('profile_telegram_unlink_error')),
  })

  async function handleLink() {
    try {
      const resp = await getTelegramClientId()
      const { verifier, challenge } = await generatePKCE()
      const state = generateState()
      const redirectUri = `${window.location.origin}/auth/telegram/callback`

      sessionStorage.setItem(TG_PKCE_KEY, verifier)
      sessionStorage.setItem(TG_STATE_KEY, state)
      sessionStorage.setItem(TG_MODE_KEY, 'link')

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: String(resp.client_id),
        redirect_uri: redirectUri,
        scope: 'openid profile',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      })

      window.location.href = `${TELEGRAM_OAUTH_URL}/auth?${params}`
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('profile_telegram_link_error'))
    }
  }

  // ── Telegram OAuth return notices ────────────────────────────────────────────
  useEffect(() => {
    if (handledProfileNotice.current) return
    const hasNotice = searchParams.has('telegram_linked') || searchParams.has('error')
    if (!hasNotice) return
    handledProfileNotice.current = true

    if (searchParams.get('telegram_linked')) {
      toast.success(t('profile_telegram_linked_success'))
    } else if (searchParams.get('error') === 'already_linked') {
      toast.error(t('profile_telegram_already_linked'))
    } else if (searchParams.get('error') === 'telegram_link_failed') {
      toast.error(t('profile_telegram_link_error'))
    }
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, t, toast])

  // ── Identity ─────────────────────────────────────────────────────────────────
  const displayName =
    profile?.telegram_first_name || profile?.email?.split('@')[0] || t('profile_account')
  const initial = (displayName[0] ?? 'A').toUpperCase()

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('profile_title')}</h1>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-xl bg-[hsl(var(--muted))]" />
            ))}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('profile_account')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Identity */}
              <div className="flex items-center gap-4">
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-3xl font-extrabold text-[var(--primary-press)]">
                  {initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold text-[hsl(var(--foreground))]">{displayName}</p>
                  {profile?.email && (
                    <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{profile.email}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profile?.telegram_username && (
                      <Badge variant="info">@{profile.telegram_username}</Badge>
                    )}
                    {profile?.email &&
                      (profile.is_email_verified ? (
                        <Badge variant="success" dot>
                          {t('profile_email_verified')}
                        </Badge>
                      ) : (
                        <Badge variant="warning" dot>
                          {t('profile_email_unverified')}
                        </Badge>
                      ))}
                  </div>
                </div>
              </div>

              {/* Fields */}
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                <Field label="Email">
                  <ReadonlyBox>
                    <Mail size={16} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
                    <span className="min-w-0 flex-1 truncate text-sm">{profile?.email || '—'}</span>
                  </ReadonlyBox>
                </Field>

                <Field label="Telegram">
                  <ReadonlyBox>
                    <Send size={16} className="shrink-0 text-[hsl(var(--primary))]" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {profile?.telegram_username
                        ? `@${profile.telegram_username}`
                        : isLinked
                          ? `ID: ${profile?.telegram_user_id}`
                          : t('profile_telegram_field_empty')}
                    </span>
                    {isLinked && (
                      <Badge variant="success" className="shrink-0">
                        <Check size={12} /> {t('profile_telegram_linked')}
                      </Badge>
                    )}
                  </ReadonlyBox>
                </Field>

                <Field label={t('profile_interface_language')}>
                  <Select
                    value={currentLang}
                    onChange={(e) => langMutation.mutate(e.target.value)}
                    disabled={langMutation.isPending}
                  >
                    <option value="ru">🇷🇺 Русский</option>
                    <option value="en">🇬🇧 English</option>
                  </Select>
                </Field>

                <Field label={t('profile_account_id')}>
                  <ReadonlyBox>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-[hsl(var(--muted-foreground))]">
                      {profile?.account_id}
                    </span>
                  </ReadonlyBox>
                </Field>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => (emailOpen ? resetEmailFlow() : setEmailOpen(true))}>
                  <Mail size={16} /> {t('profile_change_email_link')}
                </Button>
                <Button variant="outline" onClick={() => navigate('/forgot-password')}>
                  <Lock size={16} /> {t('profile_change_password')}
                </Button>
                {isLinked ? (
                  <Button
                    variant="outline"
                    onClick={() => unlinkMutation.mutate()}
                    isLoading={unlinkMutation.isPending}
                  >
                    <Send size={16} /> {t('profile_telegram_unlink')}
                  </Button>
                ) : (
                  <Button onClick={handleLink}>
                    <Send size={16} /> {t('profile_telegram_link')}
                  </Button>
                )}
              </div>

              {/* Email change panel */}
              {emailOpen && (
                <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] p-4">
                  {step === 'idle' && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        type="email"
                        placeholder={t('profile_new_email')}
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        onClick={() => sendCode.mutate()}
                        disabled={!newEmail}
                        isLoading={sendCode.isPending}
                      >
                        {t('profile_change_email')}
                      </Button>
                    </div>
                  )}

                  {step === 'code' && (
                    <div className="space-y-2">
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        {t('profile_code_sent', { email: newEmail })}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          type="text"
                          placeholder={t('profile_code_placeholder')}
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          maxLength={6}
                          className="flex-1"
                        />
                        <Button
                          onClick={() => verifyCode.mutate()}
                          disabled={!code}
                          isLoading={verifyCode.isPending}
                        >
                          {t('profile_confirm')}
                        </Button>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-[hsl(var(--muted-foreground))] hover:underline"
                        onClick={() => {
                          setStep('idle')
                          setCode('')
                          setErrorMsg('')
                        }}
                      >
                        {t('profile_change_email_link')}
                      </button>
                    </div>
                  )}

                  {errorMsg && (
                    <Alert variant="danger" icon={<AlertCircle size={16} />}>
                      {errorMsg}
                    </Alert>
                  )}
                </div>
              )}

              {/* Legal documents */}
              {legalDocs.length > 0 && (
                <div className="border-t border-[hsl(var(--border))] pt-5">
                  <p className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">
                    {t('profile_legal_documents')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {legalDocs.map((doc, i) => {
                      const lastOdd = legalDocs.length % 2 === 1 && i === legalDocs.length - 1
                      return (
                        <Link
                          key={doc.to}
                          to={doc.to}
                          className={cn(
                            buttonVariants({ variant: 'outline' }),
                            'w-full',
                            lastOdd && 'col-span-2',
                          )}
                        >
                          <ExternalLink size={16} className="shrink-0" />
                          <span className="min-w-0 truncate">{doc.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
