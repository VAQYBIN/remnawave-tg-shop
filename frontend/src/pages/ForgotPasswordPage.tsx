import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { sendResetCode, resetPassword } from '@/api/auth'
import { ApiError } from '@/api/client'

type Step = 'email' | 'reset' | 'done'

export function ForgotPasswordPage() {
  const navigate = useNavigate()

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
      setStep('reset')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Произошла ошибка. Попробуйте позже.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }
    if (newPassword.length < 8) {
      setError('Пароль должен содержать минимум 8 символов')
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
        setError('Произошла ошибка. Попробуйте позже.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[hsl(var(--background))]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-[hsl(197,74%,40%)]">Raccoonito</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Личный кабинет</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Восстановление пароля</CardTitle>
            <CardDescription>
              {step === 'email' && 'Введите email, привязанный к аккаунту'}
              {step === 'reset' && 'Проверьте почту и введите код'}
              {step === 'done' && 'Пароль успешно изменён'}
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
                  Получить код сброса
                </Button>
              </form>
            )}

            {step === 'reset' && (
              <form onSubmit={handleReset} className="flex flex-col gap-3">
                <div className="rounded-[var(--radius)] bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700 flex flex-col gap-1">
                  <span>Если аккаунт с адресом <strong>{email}</strong> существует — письмо с кодом уже в пути.</span>
                </div>
                <Input
                  label="Код из письма"
                  id="code"
                  type="text"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
                <Input
                  label="Новый пароль"
                  id="new-password"
                  type="password"
                  placeholder="Минимум 8 символов"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <Input
                  label="Подтвердите пароль"
                  id="confirm-password"
                  type="password"
                  placeholder="Повторите пароль"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <Button type="submit" isLoading={isLoading} className="w-full">
                  Сохранить новый пароль
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setStep('email')
                    setError('')
                  }}
                >
                  Изменить email
                </Button>
              </form>
            )}

            {step === 'done' && (
              <div className="flex flex-col gap-3">
                <div className="rounded-[var(--radius)] bg-green-50 border border-green-200 px-3 py-3 text-sm text-green-700 text-center">
                  Пароль изменён. Теперь вы можете войти.
                </div>
                <Button className="w-full" onClick={() => navigate('/login')}>
                  Войти
                </Button>
              </div>
            )}

            {step !== 'done' && (
              <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
                Вспомнили пароль?{' '}
                <Link to="/login" className="text-[hsl(var(--primary))] hover:underline font-medium">
                  Войти
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
