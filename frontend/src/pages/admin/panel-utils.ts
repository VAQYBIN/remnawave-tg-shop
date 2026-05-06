import type { PanelObject } from '@/api/admin/panel'

export function getString(obj: PanelObject | null | undefined, key: string, fallback = '—') {
  const value = obj?.[key]
  return typeof value === 'string' && value ? value : fallback
}

export function formatScalar(value: unknown, fallback = '—') {
  if (typeof value === 'string' && value) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return fallback
}

export function getNumber(obj: PanelObject | null | undefined, key: string, fallback = 0) {
  const value = obj?.[key]
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

export function getBool(obj: PanelObject | null | undefined, key: string) {
  return obj?.[key] === true
}

export function getObject(obj: PanelObject | null | undefined, key: string): PanelObject {
  const value = obj?.[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as PanelObject : {}
}

export function getArray(obj: PanelObject | null | undefined, key: string): PanelObject[] {
  const value = obj?.[key]
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as PanelObject[] : []
}

export function formatBytes(value: unknown) {
  const bytes = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б'
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ', 'ПБ']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const scaled = bytes / 1024 ** index
  return `${scaled.toFixed(scaled >= 10 ? 0 : 1)} ${units[index]}`
}

export function formatPercent(used: number, total: number) {
  if (!total) return '0%'
  return `${Math.min(100, Math.round((used / total) * 100))}%`
}
