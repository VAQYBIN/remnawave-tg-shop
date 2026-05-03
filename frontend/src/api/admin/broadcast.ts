import { apiRequest } from '@/api/client'

export type BroadcastFilter = 'all' | 'active' | 'inactive'

export interface BroadcastStartResponse {
  broadcast_id: string
  status: string
}

export interface BroadcastStatusResponse {
  broadcast_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  total: number
  sent: number
  failed: number
  error?: string
}

export function startBroadcast(
  text: string,
  filter: BroadcastFilter = 'all',
): Promise<BroadcastStartResponse> {
  return apiRequest<BroadcastStartResponse>('/admin/broadcast', {
    method: 'POST',
    body: JSON.stringify({ text, filter }),
  })
}

export function getBroadcastStatus(broadcastId: string): Promise<BroadcastStatusResponse> {
  return apiRequest<BroadcastStatusResponse>(`/admin/broadcast/status/${broadcastId}`)
}
