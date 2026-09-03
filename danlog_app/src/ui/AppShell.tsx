import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useWorkbench, type Page } from '../store/workbench'
import { PRESETS } from '../chem/properties'
import { usePresetName } from './usePresetName'

/**
 * The frame every page sits in.
 *
 * The old header put RDKit's load state and the WebMCP tool list in the same
 * visual weight as the chemistry. Here the agent's health is one quiet pill and
 * everything a developer needs is behind the trace button, because a chemist
 * reading this screen is not debugging the browser.
 */

const NAV: { id: Page; label: string; icon: ReactNode }[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: (
      <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" />
    ),
  },
  {
    id: 'design',
    label: 'Design',
    icon: (
      <>
        <path d="M14.5 3.5 20.5 9.5" />
        <path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5 3.5 20Z" />
      </>
    ),
  },
  {
    id: 'explore',
    label: 'Explore',
    icon: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
      </>
    ),
  },
  {
    id: 'compare',
    label: 'Compare',
    icon: (
      <>
        <path d="M5 20V10M12 20V4M19 20v-6" />
      </>
    ),
  },
  {
    id: 'evolution',
    label: 'Evolution',
    icon: (
      <>
        <circle cx="6" cy="7" r="2.5" />
        <circle cx="18" cy="17" r="2.5" />
        <path d="M8.5 7H14a4 4 0 0 1 0 8h-4a4 4 0 0 0 0 4h-.5" />
      </>
    ),
  },
]

const FOOT: { id: Page; label: string; icon: ReactNode }[] = [
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
      </>
    ),
  },
  {
    id: 'help',
    label: 'Help',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.6.2-.7.6-.7 1.1v.5" />
        <path d="M12 17h.01" />
      </>
    ),
  },
]

function NavButton({
  item,
  active,
  onClick,
}: {
  item: { id: Page; label: string; icon: ReactNode }
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      className={'nav__item' + (active ? ' nav__item--on' : '')}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <svg
        className="nav__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {item.icon}
      </svg>
      <span className="nav__label">{item.label}</span>
    </button>
  )
}

function Sidebar() {
  const page = useWorkbench((s) => s.page)
  const setPage = useWorkbench((s) => s.setPage)

  return (
    <nav className="nav" aria-label="Sections">
      <div className="nav__brand">
        <svg className="nav__logo" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.6 20.4 7.3v9.4L12 21.4 3.6 16.7V7.3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2.6" fill="currentColor" />
        </svg>
        <span className="nav__brandtext">
          <strong>ANALOG</strong>
          <em>Molecule Design</em>
        </span>
      </div>

      <div className="nav__group">
        {NAV.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={page === item.id}
            onClick={() => setPage(item.id)}
          />
        ))}
      </div>

      <div className="nav__group nav__group--foot">
        {FOOT.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={page === item.id}
            onClick={() => setPage(item.id)}
          />
        ))}
      </div>
    </nav>
  )
}

/** Derives a project title from whatever molecule is in focus. */
function useProjectName(): string {
  const smiles = useWorkbench((s) => s.focus?.properties.canonicalSmiles ?? null)
  const preset = usePresetName(smiles)
  if (!smiles) return 'New project'
  return preset ? `${preset} Analog Series` : 'Custom Analog Series'
}

function ProjectMenu() {
  const name = useProjectName()
  const setFocus = useWorkbench((s) => s.setFocus)
  const note = useWorkbench((s) => s.note)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const pick = async (preset: { name: string; smiles: string }) => {
    setOpen(false)
    try {
      await setFocus(preset.smiles)
      note({ actor: 'human', tool: 'set_focus_molecule', detail: preset.name, ok: true })
    } catch {
      /* the Design page surfaces load errors; the menu stays quiet */
    }
  }

  return (
    <div className="project" ref={box}>
      <span className="project__label">Project</span>
      <button className="project__button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {name}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="project__caret">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="project__menu" role="menu">
          <p className="project__menuhead">Start a series from</p>
          {PRESETS.map((preset) => (
            <button key={preset.name} role="menuitem" onClick={() => void pick(preset)}>
              {preset.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TopBar({ tools, agentReady }: { tools: number; agentReady: boolean }) {
  const setTraceOpen = useWorkbench((s) => s.setTraceOpen)
  const logCount = useWorkbench((s) => s.log.length)

  return (
    <header className="topbar">
      <ProjectMenu />
      <div className="topbar__right">
        <span className={'agent' + (agentReady ? ' agent--ok' : ' agent--bad')}>
          <i className="agent__dot" />
          {agentReady ? 'Agent ready' : 'Agent unavailable'}
        </span>
        <span className="toolcount" title="WebMCP tools exposed to the agent">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M14.7 6.3a3.8 3.8 0 0 1 5.4 5.4l-2.1 2.1M9.3 17.7a3.8 3.8 0 0 1-5.4-5.4l2.1-2.1M8.5 15.5l7-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          {tools} tools connected
        </span>
        <button
          className="tracebtn"
          onClick={() => setTraceOpen(true)}
          title="Developer trace"
          aria-label="Open developer trace"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M9 6.5 3.5 12 9 17.5M15 6.5 20.5 12 15 17.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {logCount > 0 && <i className="tracebtn__dot" />}
        </button>
      </div>
    </header>
  )
}

export function AppShell({
  tools,
  agentReady,
  drawer,
  children,
}: {
  tools: number
  agentReady: boolean
  /**
   * The docked inspector. A sibling of the workspace rather than a child, so
   * that opening it narrows the board instead of covering it.
   */
  drawer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="shell">
      <Sidebar />
      <div className="shell__main">
        <TopBar tools={tools} agentReady={agentReady} />
        <main className="shell__content">{children}</main>
      </div>
      {drawer}
    </div>
  )
}
