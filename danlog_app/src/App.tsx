import { useEffect, useMemo, useState } from 'react'
import { getRDKit } from './chem/rdkit'
import { PRESETS } from './chem/properties'
import { registerTools } from './mcp/tools'
import { rankCandidates, type SortKey } from './chem/ranking'
import { useWorkbench } from './store/workbench'
import { AppShell } from './ui/AppShell'
import { DeveloperTrace } from './ui/DeveloperTrace'
import { Inspector } from './ui/Inspector'
import { DesignPage } from './pages/DesignPage'
import { OverviewPage } from './pages/OverviewPage'
import { ExplorePage } from './pages/ExplorePage'
import { ComparePage } from './pages/ComparePage'
import { EvolutionPage } from './pages/EvolutionPage'
import { ReportPage } from './pages/ReportPage'
import { SettingsPage } from './pages/MiscPages'
import { HelpPage } from './pages/HelpPage'
import './App.css'

/** Why WebMCP is not usable here, or null if it is. Read once, at render. */
function supportProblem(): string | null {
  if (document.modelContext) return null
  return window.isSecureContext
    ? 'document.modelContext is undefined. Enable chrome://flags/#enable-webmcp-testing and relaunch Chrome, or open this page in an agent browser.'
    : 'Not a secure context. WebMCP needs https:// or http://localhost; file:// will never work.'
}

function useBootstrap() {
  const [tools, setTools] = useState<string[]>([])
  const [mcpError, setMcpError] = useState<string | null>(supportProblem)

  useEffect(() => {
    const { setRdkitStatus, setFocus, restore, note } = useWorkbench.getState()
    let cancelled = false
    getRDKit()
      .then(async (rdkit) => {
        if (cancelled) return
        setRdkitStatus('ready')
        note({ actor: 'human', tool: 'rdkit', detail: 'loaded ' + rdkit.version(), ok: true })
        // A saved session wins over the default preset, but never silently:
        // the log says the board was restored rather than freshly built.
        const restored = await restore()
        if (cancelled) return
        if (restored) note({ actor: 'human', tool: 'restore', detail: 'previous session', ok: true })
        else await setFocus(PRESETS[0].smiles)
      })
      .catch((error: Error) => {
        if (!cancelled) setRdkitStatus('error', error.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // AbortController is how WebMCP tools are unregistered. It is also what makes
    // StrictMode's double-mount in dev harmless -- the first set is torn down.
    const controller = new AbortController()
    if (!document.modelContext) return () => controller.abort()
    registerTools(controller.signal)
      .then(setTools)
      .catch((error: Error) => setMcpError(error.message))
    return () => controller.abort()
  }, [])

  return { tools, mcpError }
}

export default function App() {
  const status = useWorkbench((s) => s.rdkitStatus)
  const rdkitError = useWorkbench((s) => s.rdkitError)
  const page = useWorkbench((s) => s.page)
  const candidates = useWorkbench((s) => s.candidates)
  const focus = useWorkbench((s) => s.focus)
  const { tools, mcpError } = useBootstrap()

  // Sorting lives here rather than in a page so the ranks the inspector shows
  // always match the ranks the board shows.
  const [sort, setSort] = useState<SortKey>('overall')
  const ranked = useMemo(
    () => rankCandidates(candidates, focus, sort),
    [candidates, focus, sort],
  )

  return (
    <AppShell
      tools={tools.length}
      agentReady={tools.length > 0 && status === 'ready'}
      drawer={status === 'ready' ? <Inspector ranked={ranked} /> : null}
    >
      {status === 'loading' && (
        <div className="splash">
          <div className="spinner" />
          <p>Loading the RDKit WebAssembly build (6.9 MB). One time only, it caches after this.</p>
        </div>
      )}

      {status === 'error' && (
        <div className="page">
          <section className="surface">
            <p className="error">RDKit failed to load: {rdkitError}</p>
            <p className="hint">
              Nothing in this app works without it — every number on every screen comes from
              RDKit. Reloading the page is usually enough.
            </p>
          </section>
        </div>
      )}

      {status === 'ready' && (
        <>
          {page === 'overview' && <OverviewPage ranked={ranked} />}
          {page === 'design' && <DesignPage ranked={ranked} sort={sort} setSort={setSort} />}
          {page === 'explore' && <ExplorePage ranked={ranked} sort={sort} setSort={setSort} />}
          {page === 'compare' && <ComparePage ranked={ranked} />}
          {page === 'evolution' && <EvolutionPage ranked={ranked} />}
          {page === 'report' && <ReportPage ranked={ranked} />}
          {page === 'settings' && <SettingsPage tools={tools} />}
          {page === 'help' && <HelpPage />}
        </>
      )}

      <DeveloperTrace tools={tools} mcpError={mcpError} />
    </AppShell>
  )
}
