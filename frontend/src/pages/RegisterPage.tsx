import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/useAuth'
import { registerSendCode, registerVerify } from '@/api/auth'
import { ApiError } from '@/api/client'

type Step = 'email' | 'code'

export function RegisterPage() {
  const { setAuth } = useAuth()
  const navigate = useNavigate()

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
        setError('Произошла ошибка. Попробуйте позже.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }
    if (password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов')
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
            <CardTitle>Регистрация</CardTitle>
            <CardDescription>
              {step === 'email'
                ? 'Введите email для регистрации'
                : 'Проверьте почту и введите код'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && (
              <div className="rounded-[var(--radius)] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            {step === 'email' ? (
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
                  Получить код
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="flex flex-col gap-3">
                <div className="rounded-[var(--radius)] bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700 flex flex-col gap-1">
                  <span>Мы отправили письмо с кодом на почту <strong>{email}</strong>.</span>
                  <span>Не видите? Проверьте папку «Спам».</span>
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
                  label="Пароль"
                  id="password"
                  type="password"
                  placeholder="Минимум 8 символов"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  Создать аккаунт
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
                  Изменить email
                </Button>
              </form>
            )}

            <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
              Уже есть аккаунт?{' '}
              <Link to="/login" className="text-[hsl(var(--primary))] hover:underline font-medium">
                Войти
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
