import { apiRequest } from './client'

export interface Device {
  hwid: string
  name: string | null
  platform: string | null
  os_version: string | null
  model: string | null
  user_agent: string | null
  created_at: string | null
  updated_at: string | null
}

export interface DevicesResponse {
  devices: Device[]
  total: number
}

export function getDevices(): Promise<DevicesResponse> {
  return apiRequest<DevicesResponse>('/devices')
}

export function disconnectDevice(hwid: string): Promise<void> {
  return apiRequest<void>(`/devices/${encodeURIComponent(hwid)}`, { method: 'DELETE' })
}
