import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { StatusBadge } from '@/components/support/StatusBadge'
import { TicketChat } from '@/components/support/TicketChat'
import { CATEGORY_KEY } from '@/components/support/supportMeta'
import { useToast } from '@/hooks/useToast'
import {
  addMessage,
  closeTicket,
  getTicket,
  uploadSupportImage,
  type SupportTicketDetail,
} from '@/api/support'

const MAX_ATTACHMENTS = 5

export function SupportTicketPage() {
  const { id } = useParams<{ id: string }>()
  const ticketId = Number(id)
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [confirmClose, setConfirmClose] = useState(false)

  const { data: ticket, isLoading, isError } = useQuery({
    queryKey: ['support', 'ticket', ticketId],
    queryFn: () => getTicket(ticketId),
    enabled: Number.isFinite(ticketId),
    refetchInterval: 20_000,
  })

  // The GET marks the ticket read on the server — refresh the unread badge.
  useEffect(() => {
    if (ticket) queryClient.invalidateQueries({ queryKey: ['support', 'unread'] })
  }, [ticket?.id, ticket?.messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendMutation = useMutation({
    mutationFn: ({ body, ids }: { body: string; ids: number[] }) => addMessage(ticketId, body, ids),
    onSuccess: (message) => {
      // Append the new message to the cache so it shows instantly (no reload).
      queryClient.setQueryData<SupportTicketDetail>(['support', 'ticket', ticketId], (prev) =>
        prev && !prev.messages.some((m) => m.id === message.id)
          ? { ...prev, messages: [...prev.messages, message], last_message_at: message.created_at }
          : prev,
      )
      queryClient.invalidateQueries({ queryKey: ['support', 'ticket', ticketId] })
      queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('support_send_error')),
  })

  const closeMutation = useMutation({
    mutationFn: () => closeTicket(ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support'] })
      setConfirmClose(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('support_send_error')),
  })

  const handleSend = async (body: string, ids: number[]) => {
    await sendMutation.mutateAsync({ body, ids })
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate('/support')}
          className="flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          <ArrowLeft size={16} />
          {t('support_back')}
        </button>

        {isLoading ? (
          <div className="h-64 animate-pulse rounded-xl bg-[hsl(var(--muted))]" />
        ) : isError || !ticket ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{t('support_load_error')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[hsl(var(--muted-foreground))]">
                    {t('support_ticket_number', { id: ticket.id })}
                  </span>
                  <StatusBadge status={ticket.status} />
                </div>
                <h1 className="truncate text-lg font-bold text-[hsl(var(--foreground))]">{ticket.subject}</h1>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{t(CATEGORY_KEY[ticket.category])}</p>
              </div>
              {ticket.status !== 'closed' && (
                <Button variant="outline" size="sm" onClick={() => setConfirmClose(true)}>
                  {t('support_close_ticket')}
                </Button>
              )}
            </div>

            <TicketChat
              messages={ticket.messages}
              viewerSide="user"
              onSend={handleSend}
              uploadImage={uploadSupportImage}
              maxAttachments={MAX_ATTACHMENTS}
              sending={sendMutation.isPending}
              disabled={ticket.status === 'closed'}
              disabledNotice={t('support_closed_notice')}
            />
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmClose}
        title={t('support_close_confirm_title')}
        description={t('support_close_confirm_description')}
        confirmLabel={t('support_close_confirm_yes')}
        cancelLabel={t('support_cancel')}
        destructive
        onConfirm={() => closeMutation.mutate()}
        onCancel={() => setConfirmClose(false)}
      />
    </AppShell>
  )
}
