import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { getMediaUrl, type ChannelPost } from '@/api/news'
import { ExternalLink, FileText, Film, Image } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TgEntity {
  type: string
  offset: number
  length: number
  url?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  try {
    const date = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return t('news_just_now')
    if (minutes < 60) return t('news_minutes_ago', { count: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('news_hours_ago', { count: hours })
    return date.toLocaleDateString()
  } catch {
    return iso
  }
}

/** Split plain text on newlines and return spans with <br/> between them. */
function splitLines(text: string): React.ReactNode {
  const lines = text.split('\n')
  return lines.map((line, i) => (
    <span key={i}>
      {line}
      {i < lines.length - 1 && <br />}
    </span>
  ))
}

/**
 * Render text applying Telegram message entities.
 * Only `url` and `text_link` types produce clickable <a> tags;
 * everything else renders as plain text.
 *
 * Note: Telegram entity offsets are in UTF-16 code units, matching
 * how JavaScript counts string indices — so `.slice()` is correct here.
 */
function renderTextWithEntities(
  text: string,
  entitiesJson: string | null,
): React.ReactNode {
  let entities: TgEntity[] = []

  if (entitiesJson) {
    try {
      const parsed = JSON.parse(entitiesJson) as TgEntity[]
      entities = parsed
        .filter((e) => e.type === 'url' || e.type === 'text_link')
        .sort((a, b) => a.offset - b.offset)
    } catch {
      // fall through to plain rendering
    }
  }

  if (entities.length === 0) {
    return splitLines(text)
  }

  const nodes: React.ReactNode[] = []
  let cursor = 0

  for (const entity of entities) {
    // Plain segment before this entity
    if (cursor < entity.offset) {
      nodes.push(
        <span key={`plain-${cursor}`}>{splitLines(text.slice(cursor, entity.offset))}</span>,
      )
    }

    const entityText = text.slice(entity.offset, entity.offset + entity.length)
    const href = entity.type === 'text_link' ? (entity.url ?? entityText) : entityText

    nodes.push(
      <a
        key={`link-${entity.offset}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[hsl(var(--primary))] underline underline-offset-2 break-all"
      >
        {entityText}
      </a>,
    )

    cursor = entity.offset + entity.length
  }

  // Remaining text after last entity
  if (cursor < text.length) {
    nodes.push(
      <span key={`plain-end`}>{splitLines(text.slice(cursor))}</span>,
    )
  }

  return <>{nodes}</>
}

// ─── Media preview ────────────────────────────────────────────────────────────

function MediaPreview({ post }: { post: ChannelPost }) {
  if (!post.media_type || !post.media_file_id) return null

  const url = getMediaUrl(post.media_file_id)

  if (post.media_type === 'photo') {
    return (
      <img
        src={url}
        alt=""
        className="rounded-lg max-h-96 w-full object-cover mt-3"
        loading="lazy"
        onError={(e) => {
          ;(e.target as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }

  if (post.media_type === 'video' || post.media_type === 'animation') {
    return (
      <video
        src={url}
        controls={post.media_type === 'video'}
        autoPlay={post.media_type === 'animation'}
        loop={post.media_type === 'animation'}
        muted={post.media_type === 'animation'}
        className="rounded-lg max-h-96 w-full mt-3"
      />
    )
  }

  // document / other — download link
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-3 text-sm text-[hsl(var(--primary))] hover:underline"
    >
      <FileText size={16} />
      {post.media_type}
    </a>
  )
}

// ─── Inline keyboard buttons ─────────────────────────────────────────────────

interface TgButton {
  text: string
  url: string
}

function InlineButtons({ replyMarkupJson }: { replyMarkupJson: string | null }) {
  if (!replyMarkupJson) return null

  let rows: TgButton[][] = []
  try {
    rows = JSON.parse(replyMarkupJson) as TgButton[][]
  } catch {
    return null
  }

  if (rows.length === 0) return null

  return (
    <div className="mt-3 space-y-2">
      {rows.map((row, ri) => (
        <div key={ri} className="flex gap-2">
          {row.map((btn, bi) => (
            <a
              key={bi}
              href={btn.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
            >
              <ExternalLink size={13} className="shrink-0" />
              {btn.text}
            </a>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Post card ────────────────────────────────────────────────────────────────

export function NewsPost({ post }: { post: ChannelPost }) {
  const { t } = useTranslation()
  const hasMedia = Boolean(post.media_type && post.media_file_id)

  return (
    <Card>
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
            {hasMedia && post.media_type === 'photo' && <Image size={14} />}
            {hasMedia && (post.media_type === 'video' || post.media_type === 'animation') && (
              <Film size={14} />
            )}
            {hasMedia && post.media_type === 'document' && <FileText size={14} />}
          </div>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {formatDate(post.posted_at, t)}
          </span>
        </div>

        {post.text && (
          <p className="text-sm leading-relaxed break-words">
            {renderTextWithEntities(post.text, post.entities_json)}
          </p>
        )}

        <MediaPreview post={post} />
        <InlineButtons replyMarkupJson={post.reply_markup_json} />
      </CardContent>
    </Card>
  )
}
