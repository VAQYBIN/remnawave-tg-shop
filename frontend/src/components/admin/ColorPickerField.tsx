import { useEffect, useRef, useState } from 'react'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { Copy, RotateCcw, AlertTriangle } from 'lucide-react'
import { meetsWcagAA } from '@/lib/color-utils'

interface ColorPickerFieldProps {
  label: string
  description?: string
  value: string
  onChange: (v: string) => void
  defaultValue?: string
  checkContrastWith?: string
}

export function ColorPickerField({ label, description, value, onChange, defaultValue, checkContrastWith }: ColorPickerFieldProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function handleReset() {
    if (defaultValue) onChange(defaultValue)
  }

  const safeValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'
  const hasContrastWarning = checkContrastWith
    && /^#[0-9a-fA-F]{6}$/.test(checkContrastWith)
    && !meetsWcagAA(safeValue, checkContrastWith)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</span>
          {description && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 leading-snug">{description}</p>
          )}
        </div>
        {hasContrastWarning && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--warning-bg)] text-[#a06a12] text-[10px] font-semibold flex-shrink-0 mt-0.5">
            <AlertTriangle size={10} />
            <span>Низкий контраст</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2" ref={containerRef}>
        {/* Swatch button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="w-10 h-10 rounded-lg border-2 border-[hsl(var(--border))] cursor-pointer shadow-sm hover:scale-105 transition-transform flex-shrink-0"
            style={{ backgroundColor: safeValue }}
            title="Выбрать цвет"
          />

          {open && (
            <div className="absolute z-50 top-12 left-0 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-xl p-3 flex flex-col gap-3 w-[220px]">
              <HexColorPicker color={safeValue} onChange={onChange} style={{ width: '100%', height: '160px' }} />
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-[hsl(var(--muted-foreground))] select-none">#</span>
                <HexColorInput
                  color={safeValue}
                  onChange={onChange}
                  className="flex-1 px-2 py-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm font-mono text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Hex input (always visible) */}
        <div className="flex items-center flex-1 gap-1 px-2 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
          <span className="text-sm font-mono text-[hsl(var(--muted-foreground))]">#</span>
          <HexColorInput
            color={safeValue}
            onChange={onChange}
            className="flex-1 bg-transparent text-sm font-mono text-[hsl(var(--foreground))] focus:outline-none"
          />
        </div>

        {/* Copy button */}
        <button
          type="button"
          onClick={handleCopy}
          title="Скопировать HEX"
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted))] transition-colors text-[hsl(var(--muted-foreground))]"
        >
          {copied
            ? <span className="text-[10px] font-bold text-[var(--success)]">✓</span>
            : <Copy size={14} />
          }
        </button>

        {/* Reset button */}
        {defaultValue && (
          <button
            type="button"
            onClick={handleReset}
            title="Сбросить к умолчанию"
            disabled={value === defaultValue}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted))] transition-colors text-[hsl(var(--muted-foreground))] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
