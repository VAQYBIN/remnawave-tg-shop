import type { ReactNode } from 'react'
import { SvgIcon } from './SvgIcon'

/**
 * App brand icon on a fixed dark chip.
 *
 * Subscription Page icons are built for a dark theme — many use hardcoded light
 * fills (e.g. #FAFAFA), others use currentColor. A dark chip with a light icon
 * color makes both render correctly on any cabinet background (light or dark).
 */
export function AppIcon({
  svg,
  size = 36,
  iconSize,
  fallback,
}: {
  svg: string | null
  size?: number
  iconSize?: number
  fallback?: ReactNode
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-[#1e293b] text-white ring-1 ring-black/5"
      style={{ width: size, height: size }}
    >
      {svg ? <SvgIcon svg={svg} size={iconSize ?? Math.round(size * 0.56)} /> : fallback}
    </span>
  )
}
