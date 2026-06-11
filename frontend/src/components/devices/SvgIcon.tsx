/** Renders a raw SVG string from the app config's svgLibrary, scaled to `size`. */
export function SvgIcon({
  svg,
  size = 18,
  className,
}: {
  svg: string | null
  size?: number
  className?: string
}) {
  if (!svg) return null
  return (
    <span
      aria-hidden
      className={['inline-flex shrink-0 [&>svg]:h-full [&>svg]:w-full', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
