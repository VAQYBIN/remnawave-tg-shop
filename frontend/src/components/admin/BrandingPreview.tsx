import { useEffect, useState } from 'react'
import { LayoutDashboard, CreditCard, Wifi, User, Sun, Moon, Search } from 'lucide-react'
import { paletteToCssVars, type Theme } from '@/lib/theme'

type PaletteName = 'light' | 'dark'

interface BrandingPreviewProps {
  brandName: string
  theme: Theme
  fontFamily?: string
  headingFontFamily?: string
  defaultScheme?: PaletteName
}

// Shorthands for referencing the preview's scoped CSS variables.
const c = (token: string) => `hsl(var(--${token}))`
const raw = (token: string) => `var(--${token})`

export function BrandingPreview({
  brandName,
  theme,
  fontFamily,
  headingFontFamily,
  defaultScheme = 'light',
}: BrandingPreviewProps) {
  const [scheme, setScheme] = useState<PaletteName>(defaultScheme)
  // Follow the palette being edited; the user can still toggle independently.
  useEffect(() => { setScheme(defaultScheme) }, [defaultScheme])
  const palette = theme[scheme]
  const body = fontFamily ? `'${fontFamily}', sans-serif` : 'sans-serif'
  const heading = headingFontFamily
    ? `'${headingFontFamily}', sans-serif`
    : body

  const vars = {
    ...paletteToCssVars(palette),
    '--radius': theme.radius,
    fontFamily: body,
  } as React.CSSProperties

  const badge = (label: string, fg: string, bg: string) => (
    <span
      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
      style={{ color: raw(fg), backgroundColor: raw(bg) }}
    >
      {label}
    </span>
  )

  return (
    <div
      className="select-none overflow-hidden rounded-xl border text-[13px] shadow-sm"
      style={{ ...vars, borderColor: c('border'), backgroundColor: c('background'), color: c('foreground') }}
    >
      {/* Top bar */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ backgroundColor: c('card'), borderColor: c('border') }}
      >
        <div
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
          style={{ backgroundColor: c('primary'), color: c('primary-foreground') }}
        >
          {brandName.charAt(0).toUpperCase() || 'R'}
        </div>
        <span className="truncate text-xs font-bold" style={{ color: c('card-foreground'), fontFamily: heading }}>
          {brandName || 'Brand'}
        </span>
        <button
          type="button"
          onClick={() => setScheme(s => (s === 'light' ? 'dark' : 'light'))}
          className="ml-auto flex h-5 w-5 items-center justify-center rounded-md"
          style={{ color: c('muted-foreground'), backgroundColor: c('muted') }}
          title="light / dark"
        >
          {scheme === 'light' ? <Sun size={11} /> : <Moon size={11} />}
        </button>
      </div>

      {/* Body */}
      <div className="flex" style={{ minHeight: 220 }}>
        {/* Sidebar */}
        <div
          className="flex flex-shrink-0 flex-col gap-0.5 border-r p-2"
          style={{ backgroundColor: c('card'), borderColor: c('border'), width: 96 }}
        >
          {[
            { icon: <LayoutDashboard size={11} />, label: 'Обзор', active: true },
            { icon: <CreditCard size={11} />, label: 'Подписка', active: false },
            { icon: <Wifi size={11} />, label: 'Устройства', active: false },
            { icon: <User size={11} />, label: 'Профиль', active: false },
          ].map(({ icon, label, active }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium"
              style={{
                backgroundColor: active ? c('primary') : 'transparent',
                color: active ? c('primary-foreground') : c('muted-foreground'),
              }}
            >
              {icon}
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Content area */}
        <div className="flex flex-1 flex-col gap-2 overflow-hidden p-3">
          <p className="text-xs font-bold" style={{ color: c('foreground'), fontFamily: heading }}>
            Добро пожаловать!
          </p>
          <p className="text-[10px]" style={{ color: c('muted-foreground') }}>
            Управляйте подпиской и устройствами.
          </p>

          {/* Buttons */}
          <div className="flex flex-wrap gap-1.5">
            <button className="rounded-md px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: c('primary'), color: c('primary-foreground') }}>
              Оплатить
            </button>
            <button className="rounded-md px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: c('secondary'), color: c('secondary-foreground') }}>
              Вторичная
            </button>
            <button className="rounded-md border px-2 py-1 text-[10px] font-semibold" style={{ borderColor: c('border'), color: c('foreground') }}>
              Контур
            </button>
            <button className="rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: raw('danger'), backgroundColor: raw('danger-bg') }}>
              Удалить
            </button>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1">
            {badge('Успех', 'success', 'success-bg')}
            {badge('Внимание', 'warning', 'warning-bg')}
            {badge('Ошибка', 'danger', 'danger-bg')}
            {badge('Инфо', 'info', 'info-bg')}
          </div>

          {/* Input */}
          <div
            className="flex items-center gap-1.5 rounded-md border px-2 py-1"
            style={{ backgroundColor: c('background'), borderColor: c('border') }}
          >
            <Search size={11} style={{ color: c('muted-foreground') }} />
            <span className="text-[10px]" style={{ color: c('muted-foreground') }}>Поиск…</span>
          </div>

          {/* Subscription card */}
          <div className="flex flex-col gap-1.5 rounded-lg border p-2.5" style={{ backgroundColor: c('card'), borderColor: c('border') }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold" style={{ color: c('card-foreground') }}>Текущая подписка</span>
              {badge('Активна', 'success', 'success-bg')}
            </div>
            <div className="flex gap-3">
              <div>
                <p className="text-[9px]" style={{ color: c('muted-foreground') }}>Действует до</p>
                <p className="text-[10px] font-medium" style={{ color: c('card-foreground') }}>31.12.2025</p>
              </div>
              <div>
                <p className="text-[9px]" style={{ color: c('muted-foreground') }}>Трафик</p>
                <p className="text-[10px] font-medium" style={{ color: c('card-foreground') }}>∞</p>
              </div>
            </div>
          </div>

          {/* Mini table */}
          <div className="overflow-hidden rounded-lg border" style={{ borderColor: c('border') }}>
            <div className="flex px-2 py-1 text-[9px] font-semibold" style={{ backgroundColor: c('muted'), color: c('muted-foreground') }}>
              <span className="flex-1">Платёж</span>
              <span>Сумма</span>
            </div>
            {[['12.05', '299 ₽'], ['12.04', '299 ₽']].map(([d, s], i) => (
              <div
                key={i}
                className="flex px-2 py-1 text-[9px]"
                style={{ color: c('card-foreground'), backgroundColor: c('card'), borderTop: `1px solid ${c('border')}` }}
              >
                <span className="flex-1">{d}</span>
                <span className="tabular-nums">{s}</span>
              </div>
            ))}
          </div>

          {/* Info alert */}
          <div className="rounded-md px-2 py-1.5 text-[9px]" style={{ backgroundColor: raw('info-bg'), color: raw('info') }}>
            Новое устройство добавлено.
          </div>

          {/* Link */}
          <a className="text-[10px] font-medium underline" style={{ color: c('primary') }}>
            Открыть инструкцию
          </a>
        </div>
      </div>

      {/* Footer */}
      <div
        className="border-t py-1 text-center text-[9px]"
        style={{ borderColor: c('border'), color: c('muted-foreground'), backgroundColor: c('card') }}
      >
        Предпросмотр · {scheme === 'light' ? 'Светлая' : 'Тёмная'}
      </div>
    </div>
  )
}
