import { apiRequest, API_BASE } from './client'

export interface ChannelPost {
  id: number
  telegram_message_id: number
  channel_id: number
  text: string | null
  entities_json: string | null
  media_type: string | null
  media_file_id: string | null
  media_url: string | null
  reply_markup_json: string | null
  posted_at: string
}

export interface NewsListResponse {
  posts: ChannelPost[]
  total: number
  page: number
  limit: number
}

export async function getNews(page = 1, limit = 20): Promise<NewsListResponse> {
  return apiRequest<NewsListResponse>(`/news?page=${page}&limit=${limit}`)
}

export function getNewsStreamUrl(): string {
  return `${API_BASE}/news/stream`
}

export function getMediaUrl(fileId: string): string {
  return `${API_BASE}/news/media/${encodeURIComponent(fileId)}`
}
