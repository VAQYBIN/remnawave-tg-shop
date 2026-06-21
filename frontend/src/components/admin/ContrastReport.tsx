import { useTranslation } from 'react-i18next'
import { Wand2, Check, AlertTriangle } from 'lucide-react'
import {
  contrastRatio,
  contrastLevel,
  passesContrast,
  bestTextColor,
  type ContrastKind,
} from '@/lib/color-utils'
import type { Palette } from '@/lib/theme'

interface Pair {
  fg: string
  bg: string
  kind: ContrastKind
  /** Token to auto-fix (set to best black/white on bg) when failing. */
  fix?: string
}

// Key foreground/background combinations the UI actually renders.
const PAIRS: Pair[] = [
  { fg: 'foreground', bg: 'background', kind: 'text', fix: 'foreground' },
  { fg: 'card_foreground', bg: 'card', kind: 'text', fix: 'card_foreground' },
  { fg: 'muted_foreground', bg: 'muted', kind: 'text', fix: 'muted_foreground' },
  { fg: 'muted_foreground', bg: 'background', kind: 'text' },
  { fg: 'primary_foreground', bg: 'primary', kind: 'text', fix: 'primary_foreground' },
  { fg: 'secondary_foreground', bg: 'secondary', kind: 'text', fix: 'secondary_foreground' },
  { fg: 'success', bg: 'success_bg', kind: 'large', fix: 'success' },
  { fg: 'warning', bg: 'warning_bg', kind: 'large', fix: 'warning' },
  { fg: 'danger', bg: 'danger_bg', kind: 'large', fix: 'danger' },
  { fg: 'info', bg: 'info_bg', kind: 'large', fix: 'info' },
  { fg: 'border', bg: 'background', kind: 'ui' },
]

interface ContrastReportProps {
  palette: Palette
  onFix?: (token: string, value: string) => void
}

export function ContrastReport({ palette, onFix }: ContrastReportProps) {
  const { t } = useTranslation()

  const rows = PAIRS.map(p => {
    const fgColor = palette[p.fg]
    const bgColor = palette[p.bg]
    const ratio = contrastRatio(fgColor, bgColor)
    const ok = passesContrast(ratio, p.kind)
    return { ...p, fgColor, bgColor, ratio, ok, level: contrastLevel(ratio) }
  })
  const failing = rows.filter(r => !r.ok).length

  const badgeClass = (ok: boolean) =>
    ok
      ? 'bg-[var(--success-bg)] text-[var(--success)]'
      : 'bg-[var(--danger-bg)] text-[var(--danger)]'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">
            {t('admin_branding_contrast_title')}
          </h2>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            {t('admin_branding_contrast_hint')}
          </p>
        </div>
        <span
          className={[
            'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            failing === 0 ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--warning-bg)] text-[var(--warning)]',
          ].join(' ')}
        >
          {failing === 0
            ? <><Check size={11} />{t('admin_branding_contrast_ok')}</>
            : <><AlertTriangle size={11} />{failing}</>}
        </span>
      </div>

      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-2.5 py-1.5"
          >
            {/* Sample */}
            <span
              className="flex h-7 w-9 shrink-0 items-center justify-center rounded text-[11px] font-bold"
              style={{ backgroundColor: r.bgColor, color: r.fgColor, border: '1px solid hsl(var(--border))' }}
            >
              Aa
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-[hsl(var(--foreground))]">
                {t(`brand_token_${r.fg}`)} <span className="text-[hsl(var(--muted-foreground))]">/</span> {t(`brand_token_${r.bg}`)}
              </div>
              <div className="text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]">
                {r.ratio.toFixed(2)}:1
              </div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeClass(r.ok)}`}>
              {r.ok ? r.level : t('admin_branding_contrast_fail')}
            </span>
            {!r.ok && r.fix && onFix && (
              <button
                type="button"
                onClick={() => onFix(r.fix!, bestTextColor(r.bgColor))}
                title={t('admin_branding_contrast_fix')}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
              >
                <Wand2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
