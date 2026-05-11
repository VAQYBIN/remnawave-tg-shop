import { useEffect } from 'react'

export const GOOGLE_FONTS = [
  'Nunito',
  'Inter',
  'Roboto',
  'Montserrat',
  'Poppins',
  'Raleway',
  'Open Sans',
  'Lato',
  'Ubuntu',
  'Oswald',
]

function loadGoogleFont(family: string) {
  const id = `gfont-${family.replace(/\s+/g, '-').toLowerCase()}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700&display=swap`
  document.head.appendChild(link)
}

interface FontSelectProps {
  value: string
  onChange: (font: string) => void
  label: string
  description?: string
}

export function FontSelect({ value, onChange, label, description }: FontSelectProps) {
  // Pre-load all fonts so they render correctly in the dropdown
  useEffect(() => {
    GOOGLE_FONTS.forEach(loadGoogleFont)
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <span className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</span>
        {description && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 leading-snug">{description}</p>
        )}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] cursor-pointer"
        style={{ fontFamily: value ? `'${value}', sans-serif` : 'sans-serif' }}
      >
        {GOOGLE_FONTS.map(font => (
          <option key={font} value={font} style={{ fontFamily: `'${font}', sans-serif` }}>
            {font}
          </option>
        ))}
        {value && !GOOGLE_FONTS.includes(value) && (
          <option value={value}>{value} (custom)</option>
        )}
      </select>

      {/* Font preview */}
      {value && (
        <p
          className="text-sm text-[hsl(var(--muted-foreground))] px-1"
          style={{ fontFamily: `'${value}', sans-serif` }}
        >
          The quick brown fox jumps over the lazy dog
        </p>
      )}
    </div>
  )
}
