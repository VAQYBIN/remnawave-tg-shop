import DOMPurify from 'dompurify'

// The app config comes from the Remnawave panel (operator-controlled), but it is
// an external system and the result is rendered to every end user — so we sanitize
// step title/description HTML defensively before injecting it.
const ALLOWED_TAGS = ['a', 'b', 'i', 'strong', 'em', 'br', 'code', 'p', 'span', 'ul', 'ol', 'li']
const ALLOWED_ATTR = ['href', 'target', 'rel']

export function sanitizeHtml(html: string): string {
  if (!html) return ''
  // DOMPurify also strips dangerous href schemes (javascript:, data:, ...) from <a>.
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}

// Icons come from the panel's svgLibrary (operator-controlled, external system).
// Sanitize with the SVG profile so a tampered config can't smuggle <script>/onload.
export function sanitizeSvg(svg: string): string {
  if (!svg) return ''
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick'],
  })
}
