import { apiRequest, apiUpload, API_BASE } from './client'

export type TicketStatus = 'new' | 'in_progress' | 'closed'
export type TicketCategory = 'payment' | 'connection' | 'subscription' | 'other'

export interface Attachment {
  id: number
  url: string
  content_type: string | null
  file_size: number | null
}

export interface SupportMessage {
  id: number
  sender_type: 'user' | 'admin'
  body: string
  created_at: string
  attachments: Attachment[]
}

export interface SupportTicketListItem {
  id: number
  subject: string
  category: TicketCategory
  status: TicketStatus
  unread_by_user: boolean
  last_message_at: string
  created_at: string
}

export interface SupportTicketListResponse {
  items: SupportTicketListItem[]
  total: number
  page: number
  page_size: number
}

export interface SupportTicketDetail {
  id: number
  subject: string
  category: TicketCategory
  status: TicketStatus
  unread_by_user: boolean
  created_at: string
  last_message_at: string
  messages: SupportMessage[]
}

export interface CreateTicketRequest {
  subject: string
  category: TicketCategory
  body: string
  attachment_ids: number[]
}

export function listTickets(page = 0, pageSize = 50): Promise<SupportTicketListResponse> {
  return apiRequest<SupportTicketListResponse>(`/support/tickets?page=${page}&page_size=${pageSize}`)
}

export function getTicket(id: number): Promise<SupportTicketDetail> {
  return apiRequest<SupportTicketDetail>(`/support/tickets/${id}`)
}

export function createTicket(body: CreateTicketRequest): Promise<SupportTicketDetail> {
  return apiRequest<SupportTicketDetail>('/support/tickets', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function addMessage(id: number, body: string, attachmentIds: number[]): Promise<SupportMessage> {
  return apiRequest<SupportMessage>(`/support/tickets/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, attachment_ids: attachmentIds }),
  })
}

export function closeTicket(id: number): Promise<SupportTicketDetail> {
  return apiRequest<SupportTicketDetail>(`/support/tickets/${id}/close`, { method: 'POST' })
}

export function uploadSupportImage(file: File): Promise<Attachment> {
  const form = new FormData()
  form.append('file', file)
  return apiUpload<Attachment>('/support/attachments', form)
}

export function getSupportUnread(): Promise<{ count: number }> {
  return apiRequest<{ count: number }>('/support/unread')
}

export function requestSupportStreamTicket(): Promise<{ ticket: string }> {
  return apiRequest<{ ticket: string }>('/support/stream-ticket', { method: 'POST' })
}

export function buildSupportStreamUrl(ticket: string): string {
  return `${API_BASE}/support/stream?ticket=${encodeURIComponent(ticket)}`
}
