/** Expand #abc → #aabbcc and strip leading # */
function normaliseHex(hex: string): string | null {
  const c = hex.replace('#', '').trim()
  if (c.length === 3) return c.split('').map(ch => ch + ch).join('')
  if (c.length === 6) return c
  return null
}

/** Convert hex color to relative luminance (WCAG 2.1) */
function relativeLuminance(hex: string): number {
  const clean = normaliseHex(hex)
  if (!clean) return 0
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255

  const linearize = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/** WCAG 2.1 contrast ratio between two hex colors (1 → 21). */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Returns true if contrast ratio meets WCAG AA (4.5:1 for normal text) */
export function meetsWcagAA(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 4.5
}

export type ContrastKind = 'text' | 'large' | 'ui'

/** WCAG minimum ratio for a given usage. */
export function minRatioFor(kind: ContrastKind): number {
  if (kind === 'text') return 4.5 // normal text AA
  if (kind === 'large') return 3 // large text AA / icons
  return 3 // non-text UI (borders, controls)
}

export type ContrastLevel = 'AAA' | 'AA' | 'AA Large' | 'Fail'

/** Rate a ratio against the normal-text thresholds (AAA 7, AA 4.5, AA-large 3). */
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA Large'
  return 'Fail'
}

/** Whether a ratio passes for the given usage kind. */
export function passesContrast(ratio: number, kind: ContrastKind): boolean {
  return ratio >= minRatioFor(kind)
}

/** Pick the text colour (near-black or white) with the best contrast on a bg. */
export function bestTextColor(background: string): string {
  const black = '#111111'
  const white = '#FFFFFF'
  return contrastRatio(black, background) >= contrastRatio(white, background) ? black : white
}
