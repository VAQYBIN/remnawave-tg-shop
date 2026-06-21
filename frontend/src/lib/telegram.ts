/**
 * Thin wrapper around the Telegram Mini App SDK (`window.Telegram.WebApp`).
 *
 * The SDK script is loaded in index.html. When the cabinet is opened as a
 * Telegram Mini App, `initData` is a non-empty signed query string we send to
 * the backend for automatic authentication. In a normal browser these helpers
 * are all no-ops / return null.
 */

interface SafeAreaInset {
  top: number
  bottom: number
  left: number
  right: number
}

interface TelegramWebApp {
  initData: string
  colorScheme: 'light' | 'dark'
  isFullscreen?: boolean
  safeAreaInset?: SafeAreaInset
  contentSafeAreaInset?: SafeAreaInset
  ready: () => void
  expand: () => void
  onEvent: (event: string, cb: () => void) => void
  offEvent: (event: string, cb: () => void) => void
  BackButton: {
    show: () => void
    hide: () => void
    onClick: (cb: () => void) => void
    offClick: (cb: () => void) => void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export function getTelegram(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null
}

/** True when the page runs inside Telegram as a Mini App (signed initData present). */
export function isMiniApp(): boolean {
  const tg = getTelegram()
  return !!tg && typeof tg.initData === 'string' && tg.initData.length > 0
}

export function getInitData(): string {
  return getTelegram()?.initData ?? ''
}

/**
 * Push Telegram's safe-area + content-safe-area insets into CSS variables so the
 * layout can avoid the Telegram header controls (close / "···" buttons), which
 * is critical in fullscreen mode where they overlay the page. Variables default
 * to 0px outside Telegram.
 */
function applyTelegramInsets(): void {
  const tg = getTelegram()
  if (!tg) return
  const safe = tg.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 }
  const content = tg.contentSafeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 }
  const root = document.documentElement
  root.style.setProperty('--tg-content-top', `${(safe.top ?? 0) + (content.top ?? 0)}px`)
  root.style.setProperty('--tg-content-bottom', `${(safe.bottom ?? 0) + (content.bottom ?? 0)}px`)
}

/** Tell Telegram the app is ready, expand it, and start tracking safe areas. */
export function initMiniApp(): void {
  const tg = getTelegram()
  if (!tg) return
  try {
    tg.ready()
    tg.expand()
    applyTelegramInsets()
    // Insets change on rotation, fullscreen toggle, and viewport changes.
    for (const ev of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) {
      tg.onEvent(ev, applyTelegramInsets)
    }
  } catch {
    // SDK not fully available — ignore
  }
}

export function getTelegramColorScheme(): 'light' | 'dark' | null {
  return getTelegram()?.colorScheme ?? null
}

/** Subscribe to Telegram theme changes. Returns an unsubscribe function. */
export function onTelegramThemeChanged(cb: () => void): () => void {
  const tg = getTelegram()
  if (!tg) return () => {}
  tg.onEvent('themeChanged', cb)
  return () => tg.offEvent('themeChanged', cb)
}

/** Show the native Telegram back button wired to `onClick`. Returns a cleanup fn. */
export function showBackButton(onClick: () => void): () => void {
  const tg = getTelegram()
  if (!tg) return () => {}
  tg.BackButton.onClick(onClick)
  tg.BackButton.show()
  return () => {
    tg.BackButton.offClick(onClick)
    tg.BackButton.hide()
  }
}

export function hideBackButton(): void {
  getTelegram()?.BackButton.hide()
}

/**
 * Whether to warn before opening the admin panel: it is table-heavy and not
 * built for small screens — true inside a Mini App or on a narrow (mobile) web
 * viewport (matches Tailwind's `md` breakpoint at 768px).
 */
export function shouldWarnAdminMobile(): boolean {
  if (isMiniApp()) return true
  return typeof window !== 'undefined'
    && !!window.matchMedia
    && window.matchMedia('(max-width: 767px)').matches
}
