import { useEffect, type ReactNode } from 'react'

/**
 * The small vocabulary every page is built from.
 *
 * Keeping these in one place is what stops the redesign drifting back into a
 * dashboard: if a status needs saying, it says it as a StatusBadge, and if a
 * number needs showing, it shows as a Metric. Nothing invents its own box.
 */

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'accent'

export function StatusBadge({
  label,
  tone = 'neutral',
  title,
}: {
  label: ReactNode
  tone?: Tone
  title?: string
}) {
  return (
    <span className={'badge badge--' + tone} title={title}>
      {label}
    </span>
  )
}

/** A label over a number. The compact block that replaces a card per property. */
export function Metric({
  label,
  value,
  unit,
  title,
  tone,
}: {
  label: string
  value: ReactNode
  unit?: string
  title?: string
  tone?: Tone
}) {
  return (
    <div className={'metric' + (tone ? ' metric--' + tone : '')} title={title}>
      <span className="metric__label">{label}</span>
      <span className="metric__value">
        {value}
        {unit && <span className="metric__unit">{unit}</span>}
      </span>
    </div>
  )
}

export function SectionHead({
  title,
  count,
  children,
}: {
  title: string
  count?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="sectionhead">
      <h2 className="sectionhead__title">
        {title}
        {count !== undefined && count !== null && <span className="sectionhead__count">{count}</span>}
      </h2>
      {children && <div className="sectionhead__actions">{children}</div>}
    </div>
  )
}

export function EmptyState({
  title,
  children,
  icon,
}: {
  title: string
  children?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="emptystate">
      {icon && <div className="emptystate__icon">{icon}</div>}
      <p className="emptystate__title">{title}</p>
      {children && <div className="emptystate__body">{children}</div>}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string }[]
  active: T
  onChange: (key: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={tab.key === active}
          className={'tabs__tab' + (tab.key === active ? ' tabs__tab--on' : '')}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/**
 * The right-hand inspection panel. Escape closes it, and focus is not trapped
 * on purpose -- the board behind stays usable while a candidate is open, which
 * is the point of a drawer rather than a modal.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  badge,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className="drawer__scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-label={typeof title === 'string' ? title : 'Inspector'}>
        <header className="drawer__head">
          <div className="drawer__heading">
            <h2 className="drawer__title">{title}</h2>
            {badge}
          </div>
          <button className="drawer__close" onClick={onClose} aria-label="Close inspector">
            ×
          </button>
        </header>
        {subtitle && <div className="drawer__subtitle">{subtitle}</div>}
        <div className="drawer__body">{children}</div>
        {footer && <footer className="drawer__foot">{footer}</footer>}
      </aside>
    </>
  )
}

/** A labelled row of two values and the movement between them. */
export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="kv">
      <span className="kv__key">{label}</span>
      <span className="kv__val">{children}</span>
    </div>
  )
}
