import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { CURATED_FONTS, loadGoogleFont } from '@/lib/theme'

// Re-export for any legacy importers.
export const GOOGLE_FONTS = CURATED_FONTS

interface FontSelectProps {
  value: string
  onChange: (font: string) => void
  label: string
  description?: string
  placeholder?: string
}

/**
 * Font combobox: pick from the curated Google Fonts list or type any other
 * family name. The chosen family is loaded dynamically and previewed.
 */
export function FontSelect({ value, onChange, label, description, placeholder }: FontSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = CURATED_FONTS.filter(f =>
    f.toLowerCase().includes(query.trim().toLowerCase())
  )

  // Load the selected font so the input + preview render correctly.
  useEffect(() => {
    if (value) loadGoogleFont(value)
  }, [value])

  // Load the fonts currently visible in the dropdown so each option previews.
  useEffect(() => {
    if (!open) return
    filtered.slice(0, 40).forEach(loadGoogleFont)
  }, [open, query]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const commit = (font: string) => {
    onChange(font)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <span className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</span>
        {description && (
          <p className="mt-0.5 text-xs leading-snug text-[hsl(var(--muted-foreground))]">{description}</p>
        )}
      </div>

      <div className="relative" ref={containerRef}>
        <div className="flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] focus-within:ring-1 focus-within:ring-[hsl(var(--primary))]">
          <input
            value={open ? query : value}
            placeholder={placeholder ?? value}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => { setQuery(''); setOpen(true) }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit(query.trim() || value)
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            className="flex-1 bg-transparent px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none"
            style={{ fontFamily: value ? `'${value}', sans-serif` : 'sans-serif' }}
          />
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="px-2 text-[hsl(var(--muted-foreground))]"
            aria-label="toggle"
          >
            <ChevronDown size={16} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        </div>

        {open && (
          <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1 shadow-xl">
            {query.trim() && !CURATED_FONTS.some(f => f.toLowerCase() === query.trim().toLowerCase()) && (
              <button
                type="button"
                onClick={() => commit(query.trim())}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
              >
                <span className="text-[hsl(var(--muted-foreground))]">+</span>
                <span style={{ fontFamily: `'${query.trim()}', sans-serif` }}>{query.trim()}</span>
              </button>
            )}
            {filtered.map(font => (
              <button
                key={font}
                type="button"
                onClick={() => commit(font)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
                style={{ fontFamily: `'${font}', sans-serif` }}
              >
                <span>{font}</span>
                {value === font && <Check size={14} className="text-[hsl(var(--primary))]" />}
              </button>
            ))}
            {filtered.length === 0 && !query.trim() && (
              <p className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">—</p>
            )}
          </div>
        )}
      </div>

      {value && (
        <p
          className="px-1 text-sm text-[hsl(var(--muted-foreground))]"
          style={{ fontFamily: `'${value}', sans-serif` }}
        >
          The quick brown fox · Съешь же ещё этих булочек 1234567890
        </p>
      )}
    </div>
  )
}
