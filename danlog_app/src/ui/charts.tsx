/**
 * Charts, drawn by hand in SVG.
 *
 * A charting library would be several hundred kilobytes for two shapes, in an
 * app whose whole pitch is that it does not hide what it is doing. These are
 * small enough to read end to end.
 */

/** Assigned in order, so a molecule keeps its colour across radar and table. */
export const SERIES_COLORS = [
  '#6d5bd0',
  '#0f9d76',
  '#d97706',
  '#2563eb',
  '#db2777',
  '#0891b2',
]

export type RadarSeries = {
  name: string
  /** One value per axis, each already normalised to 0..1. */
  values: number[]
  color: string
}

export function RadarChart({
  axes,
  series,
  size = 280,
}: {
  axes: string[]
  series: RadarSeries[]
  size?: number
}) {
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 46
  const n = axes.length
  if (n < 3) return null

  const pointAt = (i: number, r: number) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r] as const
  }

  const polygon = (values: number[]) =>
    values
      .map((v, i) => {
        const [x, y] = pointAt(i, Math.max(0, Math.min(1, v)) * radius)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

  const rings = [0.25, 0.5, 0.75, 1]

  return (
    <svg className="radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Property profile">
      {rings.map((r) => (
        <polygon
          key={r}
          className="radar__ring"
          points={polygon(new Array(n).fill(r))}
        />
      ))}

      {axes.map((_, i) => {
        const [x, y] = pointAt(i, radius)
        return <line key={i} className="radar__spoke" x1={cx} y1={cy} x2={x} y2={y} />
      })}

      {series.map((s) => (
        <g key={s.name}>
          <polygon
            className="radar__area"
            points={polygon(s.values)}
            style={{ fill: s.color, stroke: s.color }}
          />
          {s.values.map((v, i) => {
            const [x, y] = pointAt(i, Math.max(0, Math.min(1, v)) * radius)
            return <circle key={i} className="radar__dot" cx={x} cy={y} r={2.6} style={{ fill: s.color }} />
          })}
        </g>
      ))}

      {axes.map((label, i) => {
        const [x, y] = pointAt(i, radius + 18)
        const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end'
        return (
          <text key={label} className="radar__label" x={x} y={y} textAnchor={anchor} dy="0.32em">
            {label}
          </text>
        )
      })}
    </svg>
  )
}

/**
 * A property's path across generations. Flat when every value is the same,
 * rather than a misleading full-height line through a single repeated number.
 */
export function Sparkline({
  values,
  width = 120,
  height = 28,
  color = '#6d5bd0',
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (values.length < 2) return <span className="spark spark--none">—</span>

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const pad = 3

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - pad * 2) + pad
    const y = span === 0 ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2)
    return [x, y] as const
  })

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.4" fill={color} />
    </svg>
  )
}
