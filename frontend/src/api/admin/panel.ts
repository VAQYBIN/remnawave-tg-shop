import { apiRequest } from '@/api/client'

export type PanelObject = Record<string, unknown>

export interface PanelRawResponse {
  data: PanelObject
}

export interface PanelListResponse {
  items: PanelObject[]
  total: number
}

export interface PanelUsersResponse {
  items: PanelObject[]
  total: number
  page: number
  page_size: number
}

export interface PanelNodeDetailResponse {
  data: PanelObject
  users_bandwidth: PanelObject | null
}

export interface PanelNodeActionResponse {
  ok: boolean
  node: PanelObject | null
}

export interface PanelDateRangeParams {
  date_from?: string
  date_to?: string
  top_nodes_limit?: number
  top_users_limit?: number
}

function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') sp.set(key, String(value))
  })
  const query = sp.toString()
  return query ? `?${query}` : ''
}

export function getPanelStats(): Promise<PanelRawResponse> {
  return apiRequest<PanelRawResponse>('/admin/panel/stats')
}

export function getPanelMetadata(): Promise<PanelRawResponse> {
  return apiRequest<PanelRawResponse>('/admin/panel/metadata')
}

export function getPanelBandwidth(params: PanelDateRangeParams = {}): Promise<PanelRawResponse> {
  return apiRequest<PanelRawResponse>(
    `/admin/panel/bandwidth${qs({
      date_from: params.date_from,
      date_to: params.date_to,
      top_nodes_limit: params.top_nodes_limit,
    })}`,
  )
}

export function getPanelRealtimeBandwidth(): Promise<PanelRawResponse> {
  return apiRequest<PanelRawResponse>('/admin/panel/bandwidth/realtime')
}

export function getPanelNodesStats(): Promise<PanelRawResponse> {
  return apiRequest<PanelRawResponse>('/admin/panel/nodes/stats')
}

export function getPanelHwidStats(): Promise<PanelRawResponse> {
  return apiRequest<PanelRawResponse>('/admin/panel/hwid/stats')
}

export function getPanelNodes(): Promise<PanelListResponse> {
  return apiRequest<PanelListResponse>('/admin/panel/nodes')
}

export function getPanelNode(uuid: string, params: PanelDateRangeParams = {}): Promise<PanelNodeDetailResponse> {
  return apiRequest<PanelNodeDetailResponse>(
    `/admin/panel/nodes/${uuid}${qs({
      date_from: params.date_from,
      date_to: params.date_to,
      top_users_limit: params.top_users_limit,
    })}`,
  )
}

export function enablePanelNode(uuid: string): Promise<PanelNodeActionResponse> {
  return apiRequest<PanelNodeActionResponse>(`/admin/panel/nodes/${uuid}/enable`, { method: 'POST' })
}

export function disablePanelNode(uuid: string): Promise<PanelNodeActionResponse> {
  return apiRequest<PanelNodeActionResponse>(`/admin/panel/nodes/${uuid}/disable`, { method: 'POST' })
}

export function restartPanelNode(uuid: string): Promise<PanelNodeActionResponse> {
  return apiRequest<PanelNodeActionResponse>(`/admin/panel/nodes/${uuid}/restart`, { method: 'POST' })
}

export function restartAllPanelNodes(): Promise<PanelNodeActionResponse> {
  return apiRequest<PanelNodeActionResponse>('/admin/panel/nodes/restart-all', { method: 'POST' })
}

export function getPanelUsers(params: { query?: string; page?: number; page_size?: number } = {}): Promise<PanelUsersResponse> {
  return apiRequest<PanelUsersResponse>(
    `/admin/panel/users${qs({
      query: params.query,
      page: params.page,
      page_size: params.page_size,
    })}`,
  )
}

export function getPanelUser(uuid: string): Promise<PanelRawResponse> {
  return apiRequest<PanelRawResponse>(`/admin/panel/users/${uuid}`)
}

