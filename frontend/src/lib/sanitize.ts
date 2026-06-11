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
