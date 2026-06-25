import { apiRequest } from '@/api/client'

export interface RemnawaveSquad {
  uuid: string
  name: string
}

export interface SquadsResponse {
  items: RemnawaveSquad[]
  cached: boolean
}

export function getSquads(): Promise<SquadsResponse> {
  return apiRequest<SquadsResponse>('/admin/remnawave/squads')
}
