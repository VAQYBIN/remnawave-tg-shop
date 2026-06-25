import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/hooks/useToast'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { buildSupportStreamUrl, requestSupportStreamTicket } from '@/api/support'

/**
 * Subscribes to the per-user support SSE stream and surfaces a toast
 * ("New reply on ticket #N") whenever the admin replies, while keeping the
 * ticket lists and unread badge fresh. Mounted once inside the user cabinet.
 */
export function useSupportNotifications() {
  const { supportEnabled } = useBrandingContext()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const toast = useToast()

  useEffect(() => {
    if (!supportEnabled) return
    let es: EventSource | null = null
    let reconnect: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const connect = async () => {
      let ticket: string
      try {
        ticket = (await requestSupportStreamTicket()).ticket
      } catch {
        if (!closed) reconnect = setTimeout(connect, 3000)
        return
      }
      if (closed) return
      es = new EventSource(buildSupportStreamUrl(ticket))

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { event?: string; ticket_id?: number; status?: string }
          if (data.ticket_id) {
            if (data.event === 'reply') {
              toast.info(t('support_reply_received', { id: data.ticket_id }))
            } else if (data.event === 'status' && data.status === 'in_progress') {
              toast.info(t('support_taken_notice', { id: data.ticket_id }))
            } else if (data.event === 'status' && data.status === 'closed') {
              toast.info(t('support_closed_by_admin', { id: data.ticket_id }))
            }
          }
        } catch {
          /* ignore */
        }
        queryClient.invalidateQueries({ queryKey: ['support'] })
      }

      es.onerror = () => {
        es?.close()
        es = null
        if (!closed) reconnect = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnect) clearTimeout(reconnect)
      es?.close()
    }
  }, [supportEnabled, queryClient, t, toast])
}
