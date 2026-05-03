import { api } from '@/api'

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

export async function startBroadcast(
  text: string,
  filter: BroadcastFilter = 'all',
): Promise<BroadcastStartResponse> {
  const res = await api.post('/admin/broadcast', { text, filter })
  return res.data
}

export async function getBroadcastStatus(
  broadcastId: string,
): Promise<BroadcastStatusResponse> {
  const res = await api.get(`/admin/broadcast/status/${broadcastId}`)
  return res.data
}
