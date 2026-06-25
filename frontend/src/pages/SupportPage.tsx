import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LifeBuoy, Paperclip, Plus, X } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/support/StatusBadge'
import { CATEGORY_KEY, CATEGORY_ORDER } from '@/components/support/supportMeta'
import { useToast } from '@/hooks/useToast'
import { resolveAssetUrl } from '@/api/client'
import {
  createTicket,
  listTickets,
  uploadSupportImage,
  type Attachment,
  type TicketCategory,
} from '@/api/support'

const MAX_ATTACHMENTS = 5

function CreateTicketModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<TicketCategory | ''>('')
  const [body, setBody] = useState('')
  const [pending, setPending] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      createTicket({
        subject: subject.trim(),
        category: category as TicketCategory,
        body: body.trim(),
        attachment_ids: pending.map((a) => a.id),
      }),
    onSuccess: () => {
      toast.success(t('support_created'))
      queryClient.invalidateQueries({ queryKey: ['support'] })
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('support_send_error')),
  })

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const room = MAX_ATTACHMENTS - pending.length
    if (room <= 0) {
      toast.error(t('support_attachments_too_many'))
      return
    }
    setUploading(true)
    try {
      for (const file of Array.from(files).slice(0, room)) {
        const att = await uploadSupportImage(file)
        setPending((prev) => [...prev, att])
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('support_send_error'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const canSubmit = subject.trim() && category && body.trim() && !mutation.isPending && !uploading

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[hsl(var(--card))] p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">{t('support_create_title')}</h2>
          <button type="button" onClick={onClose} className="p-1 text-[hsl(var(--muted-foreground))]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <Input
            label={t('support_field_subject')}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('support_field_subject_placeholder')}
            maxLength={200}
          />

          <Select
            label={t('support_field_category')}
            value={category}
            onChange={(e) => setCategory(e.target.value as TicketCategory)}
          >
            <option value="" disabled>
              {t('support_field_category_placeholder')}
            </option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {t(CATEGORY_KEY[c])}
              </option>
            ))}
          </Select>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]">{t('support_field_message')}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder={t('support_field_message_placeholder')}
              className="w-full resize-y rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[#b6ada3] focus:border-[hsl(var(--primary))] focus:outline-none focus:[box-shadow:var(--ring-primary)]"
            />
          </div>

          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pending.map((a) => (
                <div key={a.id} className="relative">
                  <img
                    src={resolveAssetUrl(a.url) ?? a.url}
                    alt=""
                    className="h-20 w-20 rounded-lg border border-[hsl(var(--border))] object-cover"
                  />
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
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || pending.length >= MAX_ATTACHMENTS}
          >
            <Paperclip size={16} />
            {t('support_attach_images')}
          </Button>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              {t('support_cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => mutation.mutate()}
              isLoading={mutation.isPending}
              disabled={!canSubmit}
              className="flex-1"
            >
              {t('support_submit')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SupportPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['support', 'tickets'],
    queryFn: () => listTickets(0, 100),
    staleTime: 15_000,
  })

  const tickets = data?.items ?? []

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('support_title')}</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{t('support_subtitle')}</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={18} />
            <span className="hidden sm:inline">{t('support_new_ticket')}</span>
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-[hsl(var(--muted))]" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)]">
              <LifeBuoy size={24} className="text-[hsl(var(--primary))]" />
            </div>
            <p className="font-semibold text-[hsl(var(--foreground))]">{t('support_empty')}</p>
            <p className="max-w-xs text-sm text-[hsl(var(--muted-foreground))]">{t('support_empty_hint')}</p>
            <Button onClick={() => setCreateOpen(true)} className="mt-2">
              <Plus size={18} />
              {t('support_new_ticket')}
            </Button>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => navigate(`/support/${ticket.id}`)}
                className="flex w-full items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-left transition-colors hover:bg-[hsl(var(--muted)/0.5)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[hsl(var(--muted-foreground))]">#{ticket.id}</span>
                    <span className="truncate font-semibold text-[hsl(var(--foreground))]">{ticket.subject}</span>
                    {ticket.unread_by_user && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--danger)]" />}
                  </div>
                  <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {t(CATEGORY_KEY[ticket.category])}
                  </div>
                </div>
                <StatusBadge status={ticket.status} />
              </button>
            ))}
          </div>
        )}
      </div>

      {createOpen && <CreateTicketModal onClose={() => setCreateOpen(false)} />}
    </AppShell>
  )
}
