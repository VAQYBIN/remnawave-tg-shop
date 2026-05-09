import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getProfile, patchLanguage, sendEmailChangeCode, verifyEmailChange, unlinkTelegram } from '@/api/profile'
import { getTelegramClientId } from '@/api/auth'
import { TELEGRAM_OAUTH_URL, TG_MODE_KEY, TG_PKCE_KEY, TG_STATE_KEY, generatePKCE, generateState } from '@/pages/LoginPage'
import { useToast } from '@/hooks/useToast'
import { User, Mail, Globe, MessageCircle, Check, AlertCircle } from 'lucide-react'

// ─── Language Section ─────────────────────────────────────────────────────────

function LanguageSection() {
  const queryClient = useQueryClient()
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: getProfile })
  const { t, i18n } = useTranslation()

  const mutation = useMutation({
    mutationFn: (lang: string) => patchLanguage(lang),
    onSuccess: (_data, lang) => {
      i18n.changeLanguage(lang)
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })

  const langs = [
    { code: 'ru', label: 'Русский' },
    { code: 'en', label: 'English' },
  ]

  // Use i18n.language as source of truth for visual selection
  const currentLang = i18n.language.startsWith('ru') ? 'ru' : 'en'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe size={18} className="text-[hsl(var(--primary))]" />
          {t('profile_language')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {langs.map(({ code, label }) => (
            <Button
              key={code}
              variant={currentLang === code ? 'default' : 'outline'}
              size="sm"
              onClick={() => mutation.mutate(code)}
              disabled={mutation.isPending}
            >
              {label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Email Section ────────────────────────────────────────────────────────────

function EmailSection() {
  const queryClient = useQueryClient()
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: getProfile })
  const { t } = useTranslation()
  const toast = useToast()

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
      setStep('idle')
      setNewEmail('')
      setCode('')
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
    onError: (err: Error) => setErrorMsg(err.message || t('profile_error_code')),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail size={18} className="text-[hsl(var(--primary))]" />
          Email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile?.email && (
          <div className="flex items-center gap-2">
            <span className="text-sm">{profile.email}</span>
            {profile.is_email_verified ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                <Check size={12} /> {t('profile_email_verified')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                <AlertCircle size={12} /> {t('profile_email_unverified')}
              </span>
            )}
          </div>
        )}

        {step === 'idle' && (
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder={t('profile_new_email')}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={() => sendCode.mutate()}
              disabled={!newEmail || sendCode.isPending}
            >
              {sendCode.isPending ? t('profile_sending') : t('profile_change_email')}
            </Button>
          </div>
        )}

        {step === 'code' && (
          <div className="space-y-2">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {t('profile_code_sent', { email: newEmail })}
            </p>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder={t('profile_code_placeholder')}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={() => verifyCode.mutate()}
                disabled={!code || verifyCode.isPending}
              >
                {verifyCode.isPending ? t('profile_checking') : t('profile_confirm')}
              </Button>
            </div>
            <button
              className="text-xs text-[hsl(var(--muted-foreground))] hover:underline"
              onClick={() => { setStep('idle'); setCode(''); setErrorMsg('') }}
            >
              {t('profile_change_email_link')}
            </button>
          </div>
        )}

        {errorMsg && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle size={14} /> {errorMsg}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Telegram Section ─────────────────────────────────────────────────────────

function TelegramSection() {
  const queryClient = useQueryClient()
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: getProfile })
  const { t } = useTranslation()
  const toast = useToast()

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle size={18} className="text-[hsl(var(--primary))]" />
          Telegram
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLinked ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[hsl(var(--primary)/0.1)] flex items-center justify-center">
              <MessageCircle size={16} className="text-[hsl(var(--primary))]" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {profile?.telegram_first_name || profile?.telegram_username || `ID: ${profile?.telegram_user_id}`}
              </p>
              {profile?.telegram_username && (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">@{profile.telegram_username}</p>
              )}
            </div>
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              <Check size={12} /> {t('profile_telegram_linked')}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => unlinkMutation.mutate()}
              disabled={unlinkMutation.isPending}
            >
              {t('profile_telegram_unlink')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {t('profile_telegram_not_linked')}
            </p>
            <Button size="sm" onClick={handleLink}>
              {t('profile_telegram_link')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Profile Page ─────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  })
  const { t } = useTranslation()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const handledProfileNotice = useRef(false)

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

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('profile_title')}</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">
            {t('profile_subtitle')}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-[hsl(var(--muted))] animate-pulse rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User size={18} className="text-[hsl(var(--primary))]" />
                  {t('profile_account')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{t('profile_account_id')}</p>
                <p className="text-sm font-mono mt-0.5 truncate">{profile?.account_id}</p>
              </CardContent>
            </Card>

            <LanguageSection />
            <EmailSection />
            <TelegramSection />
          </div>
        )}
      </div>
    </AppShell>
  )
}
