import type { TicketCategory, TicketStatus } from '@/api/support'

export const STATUS_VARIANT: Record<TicketStatus, 'info' | 'warning' | 'secondary'> = {
  new: 'info',
  in_progress: 'warning',
  closed: 'secondary',
}

export const STATUS_KEY: Record<TicketStatus, string> = {
  new: 'support_status_new',
  in_progress: 'support_status_in_progress',
  closed: 'support_status_closed',
}

export const CATEGORY_KEY: Record<TicketCategory, string> = {
  payment: 'support_category_payment',
  connection: 'support_category_connection',
  subscription: 'support_category_subscription',
  other: 'support_category_other',
}

export const CATEGORY_ORDER: TicketCategory[] = ['payment', 'connection', 'subscription', 'other']
export const STATUS_ORDER: TicketStatus[] = ['new', 'in_progress', 'closed']
