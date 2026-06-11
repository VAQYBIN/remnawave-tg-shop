import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { buildAdminSupportStreamUrl, requestAdminSupportStreamTicket } from '@/api/admin/support'

/**
 * Subscribes the admin panel to the shared support SSE channel so the ticket
 * list and the sidebar unread badge update live as users open or reply to
 * tickets. Mounted once in the admin layout.
 */
export function useAdminSupportNotifications() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let es: EventSource | null = null
    let reconnect: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const connect = async () => {
      let ticket: string
      try {
        ticket = (await requestAdminSupportStreamTicket()).ticket
      } catch {
        if (!closed) reconnect = setTimeout(connect, 3000)
        return
      }
      if (closed) return
      es = new EventSource(buildAdminSupportStreamUrl(ticket))

      es.onmessage = () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'support'] })
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
  }, [queryClient])
}
