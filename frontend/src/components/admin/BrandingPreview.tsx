import { LayoutDashboard, CreditCard, Wifi, User } from 'lucide-react'

interface BrandingPreviewProps {
  brandName: string
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  foregroundColor: string
  cardColor: string
  borderColor: string
  fontFamily: string
}

export function BrandingPreview({
  brandName,
  primaryColor,
  secondaryColor,
  backgroundColor,
  foregroundColor,
  cardColor,
  borderColor,
  fontFamily,
}: BrandingPreviewProps) {
  const font = fontFamily ? `'${fontFamily}', sans-serif` : 'sans-serif'

  return (
    <div
      className="rounded-xl border overflow-hidden shadow-sm text-[13px] select-none"
      style={{ borderColor, backgroundColor, fontFamily: font, color: foregroundColor, minWidth: 0 }}
    >
      {/* Top bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ backgroundColor: cardColor, borderColor }}
      >
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
          style={{ backgroundColor: primaryColor }}
        >
          {brandName.charAt(0).toUpperCase() || 'R'}
        </div>
        <span className="font-bold text-xs truncate" style={{ color: foregroundColor }}>
          {brandName || 'Brand'}
        </span>
        <div className="ml-auto flex gap-1">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <div className="w-2 h-2 rounded-full bg-yellow-400" />
          <div className="w-2 h-2 rounded-full bg-green-400" />
        </div>
      </div>

      {/* Body */}
      <div className="flex" style={{ minHeight: 220 }}>
        {/* Sidebar */}
        <div
          className="flex flex-col gap-0.5 p-2 border-r flex-shrink-0"
          style={{ backgroundColor: cardColor, borderColor, width: 100 }}
        >
          {[
            { icon: <LayoutDashboard size={11} />, label: 'Обзор', active: true },
            { icon: <CreditCard size={11} />, label: 'Подписка', active: false },
            { icon: <Wifi size={11} />, label: 'Устройства', active: false },
            { icon: <User size={11} />, label: 'Профиль', active: false },
          ].map(({ icon, label, active }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium"
              style={{
                backgroundColor: active ? primaryColor : 'transparent',
                color: active ? '#fff' : secondaryColor,
              }}
            >
              {icon}
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 p-3 flex flex-col gap-2 overflow-hidden">
          {/* Greeting */}
          <p className="font-bold text-xs" style={{ color: foregroundColor }}>
            Добро пожаловать!
          </p>

          {/* Subscription card */}
          <div
            className="rounded-lg border p-2.5 flex flex-col gap-1.5"
            style={{ backgroundColor: cardColor, borderColor }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold" style={{ color: foregroundColor }}>
                Текущая подписка
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ backgroundColor: primaryColor, color: '#fff' }}
              >
                Активна
              </span>
            </div>
            <div className="flex gap-3">
              <div>
                <p className="text-[9px]" style={{ color: secondaryColor }}>Действует до</p>
                <p className="text-[10px] font-medium" style={{ color: foregroundColor }}>31.12.2025</p>
              </div>
              <div>
                <p className="text-[9px]" style={{ color: secondaryColor }}>Трафик</p>
                <p className="text-[10px] font-medium" style={{ color: foregroundColor }}>∞</p>
              </div>
            </div>
          </div>

          {/* Another card */}
          <div
            className="rounded-lg border p-2"
            style={{ backgroundColor: cardColor, borderColor }}
          >
            <p className="text-[10px] font-semibold mb-1.5" style={{ color: foregroundColor }}>
              Продлить подписку
            </p>
            <div className="flex gap-1.5 mb-2">
              {['1 мес', '3 мес', '12 мес'].map((l, i) => (
                <div
                  key={l}
                  className="flex-1 text-center text-[9px] py-1 rounded border font-medium"
                  style={
                    i === 1
                      ? { backgroundColor: primaryColor, borderColor: primaryColor, color: '#fff' }
                      : { borderColor, color: secondaryColor }
                  }
                >
                  {l}
                </div>
              ))}
            </div>
            <button
              className="w-full text-[10px] py-1 rounded font-semibold"
              style={{ backgroundColor: primaryColor, color: '#fff' }}
            >
              Оплатить
            </button>
          </div>
        </div>
      </div>

      {/* Footer label */}
      <div
        className="text-center text-[9px] py-1 border-t"
        style={{ borderColor, color: secondaryColor, backgroundColor: cardColor }}
      >
        Предпросмотр · {brandName || 'Brand'}
      </div>
    </div>
  )
}
