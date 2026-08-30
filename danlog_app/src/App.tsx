import { useEffect, useState } from 'react'
import { ConstraintEditor } from './components/ConstraintEditor'
import { getRDKit } from './chem/rdkit'
import { PRESETS } from './chem/properties'
import { registerTools, TOOL_NAMES } from './mcp/tools'
import { useWorkbench } from './store/workbench'
import type { Candidate } from './store/workbench'
import './App.css'

const FIELD_LABEL = { mw: 'MW', logP: 'logP', tpsa: 'TPSA' } as const

/**
 * logP first: MW and TPSA are additive sums the model computes reliably, so
 * they are context rather than evidence. logP is the column that actually
 * tests whether the model is guessing.
 */
const LEDGER_ORDER = ['logP', 'tpsa', 'mw'] as const

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
    const { setRdkitStatus, setFocus, note } = useWorkbench.getState()
    let cancelled = false
    getRDKit()
      .then(async (rdkit) => {
        if (cancelled) return
        setRdkitStatus('ready')
        note({ actor: 'human', tool: 'rdkit', detail: 'loaded ' + rdkit.version(), ok: true })
        await setFocus(PRESETS[0].smiles)
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

function Badge({ label, tone }: { label: string; tone: 'ok' | 'wait' | 'bad' }) {
  return <span className={'badge badge--' + tone}>{label}</span>
}

function Properties({ p }: { p: Candidate['properties'] }) {
  return (
    <dl className="props">
      <div><dt>MW</dt><dd>{p.mw}</dd></div>
      <div><dt>logP</dt><dd>{p.logP}</dd></div>
      <div><dt>TPSA</dt><dd>{p.tpsa}</dd></div>
      <div><dt>HBD</dt><dd>{p.hbd}</dd></div>
      <div><dt>HBA</dt><dd>{p.hba}</dd></div>
      <div><dt>RotB</dt><dd>{p.rotatableBonds}</dd></div>
    </dl>
  )
}

/** The point of the whole app: what the model claimed, beside what RDKit measured. */
function Scorecard({ candidate }: { candidate: Candidate }) {
  if (!candidate.scorecard.length) return null
  const rows = LEDGER_ORDER.map((field) => candidate.scorecard.find((r) => r.field === field)).filter(
    (row) => row !== undefined,
  )
  return (
    <>
      <table className="ledger">
        <thead>
          <tr><th>claimed</th><th>measured</th><th>error</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const wrong = Math.abs(row.error) > (row.field === 'logP' ? 0.5 : 5)
            return (
              <tr key={row.field} className={wrong ? 'ledger__row--wrong' : 'ledger__row--right'}>
                <td>{FIELD_LABEL[row.field]} {row.predicted}</td>
                <td>{row.actual}</td>
                <td>{row.error > 0 ? '+' + row.error : row.error}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="ledger__caption">
        MW and TPSA are additive sums the model can work out. logP is the one it has to estimate.
      </p>
    </>
  )
}

/** Which constraints the candidate broke, named specifically. */
function VerdictPanel({ candidate }: { candidate: Candidate }) {
  const { verdict } = candidate
  if (!verdict.checks.length) return null
  return (
    <ul className="checks">
      {verdict.checks.map((check) => (
        <li key={check.constraintId} className={check.satisfied ? 'checks__ok' : 'checks__bad'}>
          {check.satisfied ? '✓' : '✗'} {check.description}
          {!check.satisfied && <span className="checks__detail"> — {check.detail}</span>}
        </li>
      ))}
    </ul>
  )
}

function FocusPanel() {
  const focus = useWorkbench((s) => s.focus)
  const setFocus = useWorkbench((s) => s.setFocus)
  const note = useWorkbench((s) => s.note)
  const [draft, setDraft] = useState(PRESETS[0].smiles)
  const [error, setError] = useState<string | null>(null)

  const load = async (smiles: string) => {
    setDraft(smiles)
    try {
      await setFocus(smiles)
      setError(null)
      note({ actor: 'human', tool: 'set_focus_molecule', detail: smiles, ok: true })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section className="panel">
      <h2>Focus molecule</h2>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault()
          void load(draft)
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          aria-label="SMILES"
        />
        <button type="submit">Load</button>
      </form>
      <div className="presets">
        {PRESETS.map((preset) => (
          <button key={preset.name} className="chip" onClick={() => void load(preset.smiles)}>
            {preset.name}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {focus && (
        <>
          <div className="depiction" dangerouslySetInnerHTML={{ __html: focus.svg }} />
          <code className="smiles">{focus.properties.canonicalSmiles}</code>
          <Properties p={focus.properties} />
          <p className={focus.lipinski.passes ? 'verdict verdict--pass' : 'verdict verdict--fail'}>
            {focus.lipinski.passes
              ? 'Passes Lipinski rule of five'
              : 'Fails Lipinski: ' + focus.lipinski.violations.join(', ')}
          </p>
        </>
      )}
    </section>
  )
}

function Board() {
  const candidates = useWorkbench((s) => s.candidates)
  const goal = useWorkbench((s) => s.goal)
  const setGoal = useWorkbench((s) => s.setGoal)

  return (
    <section className="panel">
      <h2>Design board</h2>
      <input
        className="goal"
        value={goal}
        placeholder="Design goal, e.g. more water-soluble, keep the amide intact"
        onChange={(e) => setGoal(e.target.value)}
      />
      <ConstraintEditor />
      {candidates.length === 0 && (
        <p className="empty">
          No candidates yet. Ask your agent: <em>Propose three more soluble aspirin analogs, and
          predict logP before you compute it.</em>
        </p>
      )}
      <div className="cards">
        {candidates.map((candidate) => (
          <article
            key={candidate.id}
            className={candidate.verdict.accepted ? 'card' : 'card card--rejected'}
          >
            <header>
              {candidate.verdict.checks.length > 0 && (
                <Badge
                  label={candidate.verdict.accepted ? 'accepted' : 'rejected'}
                  tone={candidate.verdict.accepted ? 'ok' : 'bad'}
                />
              )}
              <Badge label={candidate.source} tone={candidate.source === 'agent' ? 'wait' : 'ok'} />
              <Badge
                label={candidate.lipinski.passes ? 'Lipinski pass' : 'Lipinski fail'}
                tone={candidate.lipinski.passes ? 'ok' : 'bad'}
              />
            </header>
            <div
              className="depiction depiction--sm"
              dangerouslySetInnerHTML={{ __html: candidate.svg }}
            />
            <code className="smiles">{candidate.properties.canonicalSmiles}</code>
            {candidate.rationale && <p className="rationale">{candidate.rationale}</p>}
            <VerdictPanel candidate={candidate} />
            <Properties p={candidate.properties} />
            <Scorecard candidate={candidate} />
            {!candidate.lipinski.passes && (
              <p className="violations">{candidate.lipinski.violations.join(' / ')}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function CallLog() {
  const log = useWorkbench((s) => s.log)
  return (
    <section className="panel panel--log">
      <h2>Call log</h2>
      <ul className="log">
        {log.map((entry) => (
          <li key={entry.id} className={entry.ok ? '' : 'log__entry--fail'}>
            <span className="log__actor">[{entry.actor}]</span> {entry.tool}
            <span className="log__detail">{entry.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function App() {
  const status = useWorkbench((s) => s.rdkitStatus)
  const rdkitError = useWorkbench((s) => s.rdkitError)
  const { tools, mcpError } = useBootstrap()

  const rdkitLabel =
    status === 'ready' ? 'RDKit ready' : status === 'error' ? 'RDKit failed' : 'Loading RDKit 6.9 MB'

  return (
    <div className="app">
      <header className="topbar">
        <h1>Analog <span className="topbar__sub">stage 0</span></h1>
        <div className="topbar__status">
          <Badge label={rdkitLabel} tone={status === 'ready' ? 'ok' : status === 'error' ? 'bad' : 'wait'} />
          <Badge
            label={tools.length ? tools.length + ' tools registered' : 'WebMCP unavailable'}
            tone={tools.length ? 'ok' : 'bad'}
          />
        </div>
      </header>

      {status === 'loading' && (
        <div className="splash">
          <div className="spinner" />
          <p>Loading the RDKit WebAssembly build (6.9 MB). One time only, it caches after this.</p>
        </div>
      )}
      {status === 'error' && <p className="error">RDKit failed to load: {rdkitError}</p>}
      {mcpError && (
        <p className="warn">
          {mcpError} Expected tools: {TOOL_NAMES.join(', ')}.
        </p>
      )}

      {status === 'ready' && (
        <main className="grid">
          <FocusPanel />
          <Board />
          <CallLog />
        </main>
      )}
    </div>
  )
}
