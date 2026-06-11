import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'
import { resolveAssetUrl } from '@/api/client'
import type { Attachment, SupportMessage } from '@/api/support'

interface TicketChatProps {
  messages: SupportMessage[]
  /** sender_type whose messages align to the right (the current viewer). */
  viewerSide: 'user' | 'admin'
  onSend: (body: string, attachmentIds: number[]) => Promise<void>
  uploadImage: (file: File) => Promise<Attachment>
  maxAttachments: number
  sending?: boolean
  disabled?: boolean
  disabledNotice?: string
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function AttachmentThumb({ url }: { url: string }) {
  const src = resolveAssetUrl(url) ?? url
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={src}
        alt=""
        className="h-28 w-28 rounded-lg border border-[hsl(var(--border))] object-cover"
        loading="lazy"
      />
    </a>
  )
}

export function TicketChat({
  messages,
  viewerSide,
  onSend,
  uploadImage,
  maxAttachments,
  sending,
  disabled,
  disabledNotice,
}: TicketChatProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [pending, setPending] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const room = maxAttachments - pending.length
    if (room <= 0) {
      toast.error(t('support_attachments_too_many'))
      return
    }
    const chosen = Array.from(files).slice(0, room)
    setUploading(true)
    try {
      for (const file of chosen) {
        const att = await uploadImage(file)
        setPending((prev) => [...prev, att])
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('support_send_error'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const canSend = !disabled && !sending && !uploading && (body.trim().length > 0 || pending.length > 0)

  const handleSend = async () => {
    if (!canSend) return
    try {
      await onSend(body.trim(), pending.map((a) => a.id))
      setBody('')
      setPending([])
    } catch {
      /* parent surfaces the error */
    }
  }

  return (
    <div className="flex flex-col">
      {/* Messages */}
      <div className="flex flex-col gap-3 py-2">
        {messages.map((m) => {
          const mine = m.sender_type === viewerSide
          const senderLabel = mine
            ? t('support_you')
            : m.sender_type === 'admin'
              ? t('support_support')
              : t('support_client')
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={[
                  'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                  mine
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-br-md'
                    : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-bl-md',
                ].join(' ')}
              >
                <div className="mb-0.5 text-[11px] font-semibold opacity-70">{senderLabel}</div>
                {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                {m.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.attachments.map((a) => (
                      <AttachmentThumb key={a.id} url={a.url} />
                    ))}
                  </div>
                )}
                <div className="mt-1 text-right text-[10px] opacity-60">{formatTime(m.created_at)}</div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      {disabled ? (
        <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-4 py-3 text-center text-sm text-[hsl(var(--muted-foreground))]">
          {disabledNotice}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
          {pending.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pending.map((a) => (
                <div key={a.id} className="relative">
                  <AttachmentThumb url={a.url} />
                  <button
                    type="button"
                    onClick={() => setPending((prev) => prev.filter((p) => p.id !== a.id))}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--danger)] p-0.5 text-white"
                    aria-label="remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || pending.length >= maxAttachments}
              aria-label={t('support_attach_images')}
            >
              <Paperclip size={18} />
            </Button>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              rows={1}
              placeholder={t('support_reply_placeholder')}
              className="max-h-40 min-h-[40px] flex-1 resize-y rounded-[var(--radius)] border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[#b6ada3] focus:border-[hsl(var(--primary))] focus:outline-none focus:[box-shadow:var(--ring-primary)]"
            />
            <Button type="button" size="icon" onClick={handleSend} isLoading={sending || uploading} disabled={!canSend}>
              <Send size={18} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
