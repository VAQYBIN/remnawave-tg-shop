/**
 * Frontend theme model — mirrors core/services/branding_theme.py.
 *
 * A theme is two palettes (light + dark) keyed by the tokens in TOKEN_KEYS plus
 * a radius. Surface/brand tokens are stored in CSS as HSL channel triplets and
 * consumed via `hsl(var(--token))` (so opacity modifiers like
 * `hsl(var(--primary)/0.12)` keep working). Semantic tokens are stored as raw
 * hex and consumed via `var(--token)`.
 */

export type ColorScheme = 'light' | 'dark' | 'system'
export type ResolvedScheme = 'light' | 'dark'

export const COLOR_SCHEME_STORAGE_KEY = 'color-scheme-pref'

export interface Palette {
  [token: string]: string
}

export interface Theme {
  light: Palette
  dark: Palette
  radius: string
}

// Order drives the admin editor grouping.
export const TOKEN_GROUPS: { label: string; tokens: string[] }[] = [
  {
    label: 'surfaces',
    tokens: ['background', 'foreground', 'card', 'card_foreground', 'muted', 'muted_foreground', 'border'],
  },
  {
    label: 'accents',
    tokens: ['primary', 'primary_foreground', 'secondary', 'secondary_foreground'],
  },
  {
    label: 'semantic',
    tokens: ['success', 'success_bg', 'warning', 'warning_bg', 'danger', 'danger_bg', 'info', 'info_bg'],
  },
]

export const TOKEN_KEYS: string[] = TOKEN_GROUPS.flatMap(g => g.tokens)

export type TokenGroup = 'surfaces' | 'accents' | 'semantic'

export interface TokenMeta {
  token: string
  group: TokenGroup
  /** Token whose colour this one is meant to be legible against (for contrast). */
  contrastWith?: string
}

// Pairs each token with the token it should contrast against, so the editor can
// flag low-contrast combinations using the actual colours in play.
export const TOKEN_META: TokenMeta[] = [
  { token: 'background', group: 'surfaces', contrastWith: 'foreground' },
  { token: 'foreground', group: 'surfaces', contrastWith: 'background' },
  { token: 'card', group: 'surfaces', contrastWith: 'card_foreground' },
  { token: 'card_foreground', group: 'surfaces', contrastWith: 'card' },
  { token: 'muted', group: 'surfaces', contrastWith: 'muted_foreground' },
  { token: 'muted_foreground', group: 'surfaces', contrastWith: 'muted' },
  { token: 'border', group: 'surfaces', contrastWith: 'background' },
  { token: 'primary', group: 'accents', contrastWith: 'primary_foreground' },
  { token: 'primary_foreground', group: 'accents', contrastWith: 'primary' },
  { token: 'secondary', group: 'accents', contrastWith: 'secondary_foreground' },
  { token: 'secondary_foreground', group: 'accents', contrastWith: 'secondary' },
  { token: 'success', group: 'semantic', contrastWith: 'success_bg' },
  { token: 'success_bg', group: 'semantic', contrastWith: 'success' },
  { token: 'warning', group: 'semantic', contrastWith: 'warning_bg' },
  { token: 'warning_bg', group: 'semantic', contrastWith: 'warning' },
  { token: 'danger', group: 'semantic', contrastWith: 'danger_bg' },
  { token: 'danger_bg', group: 'semantic', contrastWith: 'danger' },
  { token: 'info', group: 'semantic', contrastWith: 'info_bg' },
  { token: 'info_bg', group: 'semantic', contrastWith: 'info' },
]

export function tokenMeta(token: string): TokenMeta | undefined {
  return TOKEN_META.find(m => m.token === token)
}

/**
 * Curated Google Fonts for the picker. Any other family name can still be typed
 * in and is loaded dynamically — this is just the convenience list.
 */
export const CURATED_FONTS = [
  'Nunito', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
  'Raleway', 'Ubuntu', 'Oswald', 'Source Sans 3', 'Merriweather', 'Playfair Display',
  'Nunito Sans', 'Work Sans', 'Rubik', 'Mukta', 'Noto Sans', 'PT Sans', 'Quicksand',
  'Manrope', 'DM Sans', 'Karla', 'Josefin Sans', 'Mulish', 'Fira Sans', 'Cabin',
  'Barlow', 'Hind', 'Heebo', 'IBM Plex Sans', 'Titillium Web', 'Bitter', 'Arimo',
  'Dosis', 'Teko', 'Exo 2', 'Comfortaa', 'Lora', 'PT Serif', 'Roboto Slab',
  'Roboto Condensed', 'Roboto Mono', 'JetBrains Mono', 'Space Grotesk', 'Outfit',
  'Plus Jakarta Sans', 'Figtree', 'Sora', 'Onest', 'Geist', 'Albert Sans',
  'Roboto Flex', 'Archivo', 'Red Hat Display', 'Lexend', 'Schibsted Grotesk',
]

/** Tokens stored as HSL triplets and consumed via hsl(var(--x)). */
export const HSL_TOKENS = new Set([
  'background',
  'foreground',
  'card',
  'card_foreground',
  'muted',
  'muted_foreground',
  'border',
  'primary',
  'primary_foreground',
  'secondary',
  'secondary_foreground',
])

export const DEFAULT_RADIUS = '0.5rem'

export const DEFAULT_LIGHT: Palette = {
  background: '#F5F1ED',
  foreground: '#2B2B2B',
  card: '#FFFFFF',
  card_foreground: '#2B2B2B',
  muted: '#ECE8E2',
  muted_foreground: '#666666',
  border: '#DDD8D3',
  primary: '#2AACDF',
  primary_foreground: '#FFFFFF',
  secondary: '#897569',
  secondary_foreground: '#FFFFFF',
  success: '#1FAB6A',
  success_bg: '#E4F6EC',
  warning: '#D89221',
  warning_bg: '#FBEFD6',
  danger: '#DC4040',
  danger_bg: '#FBE5E5',
  info: '#2AACDF',
  info_bg: '#E6F5FB',
}

export const DEFAULT_DARK: Palette = {
  background: '#17181D',
  foreground: '#E8E8EA',
  card: '#212229',
  card_foreground: '#E8E8EA',
  muted: '#2C2D35',
  muted_foreground: '#9DA0AA',
  border: '#373943',
  primary: '#2AACDF',
  primary_foreground: '#08222C',
  secondary: '#A6907F',
  secondary_foreground: '#1A1614',
  success: '#34D399',
  success_bg: '#0E2A1E',
  warning: '#FBBF24',
  warning_bg: '#33260A',
  danger: '#F87171',
  danger_bg: '#34161A',
  info: '#38BDF8',
  info_bg: '#0C2A3A',
}

export function defaultTheme(): Theme {
  return { light: { ...DEFAULT_LIGHT }, dark: { ...DEFAULT_DARK }, radius: DEFAULT_RADIUS }
}

/** Fill missing/invalid tokens from the matching default palette. */
export function normalisePalette(raw: Palette | undefined, fallback: Palette): Palette {
  const result: Palette = {}
  for (const key of TOKEN_KEYS) {
    const v = raw?.[key]
    result[key] = isHexColor(v) ? (v as string) : fallback[key]
  }
  return result
}

export function normaliseTheme(raw: Partial<Theme> | undefined): Theme {
  return {
    light: normalisePalette(raw?.light, DEFAULT_LIGHT),
    dark: normalisePalette(raw?.dark, DEFAULT_DARK),
    radius: typeof raw?.radius === 'string' && raw.radius.trim() ? raw.radius : DEFAULT_RADIUS,
  }
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value.trim())
}

/** Expand #abc → #aabbcc */
function expandHex(hex: string): string {
  const c = hex.replace('#', '')
  if (c.length === 3) return '#' + c.split('').map(ch => ch + ch).join('')
  return '#' + c
}

/** Convert hex → "H S% L%" triplet for use in hsl(var(--x)). */
export function hexToHslTriplet(hex: string): string {
  const clean = expandHex(hex).slice(1)
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

export function cssVarName(token: string): string {
  return '--' + token.replace(/_/g, '-')
}

/**
 * Write a palette onto a target element's inline CSS variables. Surface/brand
 * tokens become HSL triplets, semantic tokens stay hex.
 */
export function applyPalette(target: HTMLElement, palette: Palette): void {
  for (const token of TOKEN_KEYS) {
    const value = palette[token]
    if (!isHexColor(value)) continue
    const name = cssVarName(token)
    target.style.setProperty(name, HSL_TOKENS.has(token) ? hexToHslTriplet(value) : value)
  }
}

// ── Color scheme resolution ──────────────────────────────────────────────────
export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

export function resolveScheme(pref: ColorScheme): ResolvedScheme {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return pref
}

export function readStoredScheme(): ColorScheme | null {
  try {
    const v = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* ignore */ }
  return null
}

export function writeStoredScheme(pref: ColorScheme): void {
  try { localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, pref) } catch { /* ignore */ }
}

// ── Google Fonts loading ─────────────────────────────────────────────────────
/** Inject a Google Fonts stylesheet for a family if not already present. */
export function loadGoogleFont(family: string): void {
  if (!family) return
  const id = `gfont-${family.replace(/\s+/g, '-').toLowerCase()}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700;800&display=swap`
  document.head.appendChild(link)
}
