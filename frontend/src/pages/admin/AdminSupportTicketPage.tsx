import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TicketChat } from '@/components/support/TicketChat'
import { StatusBadge } from '@/components/support/StatusBadge'
import { CATEGORY_KEY } from '@/components/support/supportMeta'
import { useToast } from '@/hooks/useToast'
import {
  adminCloseTicket,
  adminReply,
  adminTakeTicket,
  adminUploadSupportImage,
  getAdminTicket,
  type AdminTicketDetail,
} from '@/api/admin/support'

const MAX_ATTACHMENTS = 5

export function AdminSupportTicketPage() {
  const { id } = useParams<{ id: string }>()
  const ticketId = Number(id)
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: ticket, isLoading, isError } = useQuery({
    queryKey: ['admin', 'support', 'ticket', ticketId],
    queryFn: () => getAdminTicket(ticketId),
    enabled: Number.isFinite(ticketId),
    refetchInterval: 20_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'support'] })
  }

  const replyMutation = useMutation({
    mutationFn: ({ body, ids }: { body: string; ids: number[] }) => adminReply(ticketId, body, ids),
    onSuccess: (message) => {
      // Append the new message to the cache so it shows instantly (no reload).
      queryClient.setQueryData<AdminTicketDetail>(['admin', 'support', 'ticket', ticketId], (prev) =>
        prev && !prev.messages.some((m) => m.id === message.id)
          ? { ...prev, messages: [...prev.messages, message], last_message_at: message.created_at }
          : prev,
      )
      invalidate()
      toast.success(t('admin_support_reply_sent'))
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('support_send_error')),
  })

  const takeMutation = useMutation({
    mutationFn: () => adminTakeTicket(ticketId),
    onSuccess: (detail) => {
      queryClient.setQueryData(['admin', 'support', 'ticket', ticketId], detail)
      invalidate()
      toast.success(t('admin_support_taken'))
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('support_send_error')),
  })

  const closeMutation = useMutation({
    mutationFn: () => adminCloseTicket(ticketId),
    onSuccess: (detail) => {
      queryClient.setQueryData(['admin', 'support', 'ticket', ticketId], detail)
      invalidate()
      toast.success(t('admin_support_closed'))
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('support_send_error')),
  })

  const handleSend = async (body: string, ids: number[]) => {
    await replyMutation.mutateAsync({ body, ids })
  }

  const statusBusy = takeMutation.isPending || closeMutation.isPending

  return (
    <div className="space-y-4 px-4 py-6 sm:p-8">
      <Link
        to="/admin/support"
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        <ArrowLeft size={16} />
        {t('admin_support_back')}
      </Link>

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
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {t(CATEGORY_KEY[ticket.category])} · {ticket.account_label}
                {ticket.account_email ? ` · ${ticket.account_email}` : ''}
              </p>
            </div>
            {(ticket.status === 'new' || ticket.status === 'in_progress') && (
              <div className="flex flex-wrap gap-2">
                {ticket.status === 'new' && (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => takeMutation.mutate()}
                    isLoading={takeMutation.isPending}
                    disabled={statusBusy}
                  >
                    {t('admin_support_take')}
                  </Button>
                )}
                {ticket.status === 'in_progress' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => closeMutation.mutate()}
                    isLoading={closeMutation.isPending}
                    disabled={statusBusy}
                  >
                    {t('admin_support_close')}
                  </Button>
                )}
              </div>
            )}
          </div>

          <TicketChat
            messages={ticket.messages}
            viewerSide="admin"
            onSend={handleSend}
            uploadImage={adminUploadSupportImage}
            maxAttachments={MAX_ATTACHMENTS}
            sending={replyMutation.isPending}
            disabled={ticket.status === 'closed'}
            disabledNotice={t('admin_support_closed_notice')}
          />
        </>
      )}
    </div>
  )
}
