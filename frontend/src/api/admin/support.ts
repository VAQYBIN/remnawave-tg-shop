import { apiRequest, apiUpload, API_BASE } from '../client'
import type { Attachment, SupportMessage, TicketCategory, TicketStatus } from '../support'

export interface AdminTicketListItem {
  id: number
  subject: string
  category: TicketCategory
  status: TicketStatus
  unread_by_admin: boolean
  account_id: string
  account_label: string
  account_email: string | null
  telegram_user_id: number | null
  telegram_username: string | null
  last_message_at: string
  created_at: string
}

export interface AdminTicketListResponse {
  items: AdminTicketListItem[]
  total: number
  page: number
  page_size: number
}

export interface AdminTicketDetail {
  id: number
  subject: string
  category: TicketCategory
  status: TicketStatus
  unread_by_admin: boolean
  account_id: string
  account_label: string
  account_email: string | null
  telegram_user_id: number | null
  telegram_username: string | null
  created_at: string
  last_message_at: string
  messages: SupportMessage[]
}

export interface AdminTicketListParams {
  status?: string
  category?: string
  search?: string
  page?: number
  page_size?: number
}

export function getAdminTickets(params: AdminTicketListParams = {}): Promise<AdminTicketListResponse> {
  const sp = new URLSearchParams()
  if (params.status) sp.set('status', params.status)
  if (params.category) sp.set('category', params.category)
  if (params.search) sp.set('search', params.search)
  if (params.page !== undefined) sp.set('page', String(params.page))
  if (params.page_size !== undefined) sp.set('page_size', String(params.page_size))
  return apiRequest<AdminTicketListResponse>(`/admin/support/tickets?${sp}`)
}

export function getAdminTicket(id: number): Promise<AdminTicketDetail> {
  return apiRequest<AdminTicketDetail>(`/admin/support/tickets/${id}`)
}

export function adminReply(id: number, body: string, attachmentIds: number[]): Promise<SupportMessage> {
  return apiRequest<SupportMessage>(`/admin/support/tickets/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, attachment_ids: attachmentIds }),
  })
}

export function adminTakeTicket(id: number): Promise<AdminTicketDetail> {
  return apiRequest<AdminTicketDetail>(`/admin/support/tickets/${id}/take`, { method: 'POST' })
}

export function adminCloseTicket(id: number): Promise<AdminTicketDetail> {
  return apiRequest<AdminTicketDetail>(`/admin/support/tickets/${id}/close`, { method: 'POST' })
}

export function adminUploadSupportImage(file: File): Promise<Attachment> {
  const form = new FormData()
  form.append('file', file)
  return apiUpload<Attachment>('/admin/support/attachments', form)
}

export function getAdminSupportUnread(): Promise<{ count: number }> {
  return apiRequest<{ count: number }>('/admin/support/unread-count')
}

export function requestAdminSupportStreamTicket(): Promise<{ ticket: string }> {
  return apiRequest<{ ticket: string }>('/admin/support/stream-ticket', { method: 'POST' })
}

export function buildAdminSupportStreamUrl(ticket: string): string {
  return `${API_BASE}/admin/support/stream?ticket=${encodeURIComponent(ticket)}`
}
