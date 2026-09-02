import { useEffect, useState } from 'react'
import { getRDKit } from './chem/rdkit'
import { PRESETS } from './chem/properties'
import { GROUPS } from './chem/groups'
import { isValidPattern } from './chem/substructure'
import { registerTools, TOOL_NAMES } from './mcp/tools'
import { useWorkbench } from './store/workbench'
import type { Candidate } from './store/workbench'
import './App.css'

const FIELD_LABEL = { mw: 'MW', logP: 'logP', tpsa: 'TPSA' } as const

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
  return (
    <table className="ledger">
      <thead>
        <tr><th>claimed</th><th>measured</th><th>error</th></tr>
      </thead>
      <tbody>
        {candidate.scorecard.map((row) => {
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
  )
}

/**
 * Where the human draws the line: pick a group and nothing may remove it.
 * Everything already on the board is re-checked the moment this changes.
 */
function ScaffoldPanel() {
  const scaffold = useWorkbench((s) => s.scaffold)
  const focus = useWorkbench((s) => s.focus)
  const setScaffold = useWorkbench((s) => s.setScaffold)
  const note = useWorkbench((s) => s.note)
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pin = async (label: string, smarts: string, about: string) => {
    setError(null)
    if (!(await isValidPattern(smarts))) {
      setError(`"${smarts}" is not a valid SMARTS pattern.`)
      return
    }
    await setScaffold({ label, smarts, about })
    note({ actor: 'human', tool: 'pin_scaffold', detail: `${label}  ${smarts}`, ok: true })
  }

  const clear = async () => {
    setError(null)
    await setScaffold(null)
    note({ actor: 'human', tool: 'pin_scaffold', detail: 'cleared', ok: true })
  }

  // Present in the focus molecule? Worth knowing before you pin something absent.
  const presentInFocus = focus?.scaffoldMatch?.matched ?? null

  return (
    <section className="panel">
      <h2>Preserve</h2>
      <p className="hint">
        Pin a group and it must survive every proposal. The app checks each candidate
        and tells the agent when it broke the promise.
      </p>

      <div className="presets">
        {GROUPS.map((group) => (
          <button
            key={group.label}
            className={'chip' + (scaffold?.smarts === group.smarts ? ' chip--on' : '')}
            title={group.about}
            onClick={() => void pin(group.label, group.smarts, group.about)}
          >
            {group.label}
          </button>
        ))}
      </div>

      <form
        className="row row--tight"
        onSubmit={(event) => {
          event.preventDefault()
          void pin(custom, custom, 'Custom SMARTS pattern.')
        }}
      >
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          spellCheck={false}
          placeholder="or your own SMARTS"
          aria-label="Custom SMARTS pattern"
        />
        <button type="submit" disabled={!custom.trim()}>Pin</button>
      </form>

      {error && <p className="error">{error}</p>}

      {scaffold ? (
        <div className="pinned">
          <div className="pinned__head">
            <strong>{scaffold.label}</strong>
            <button className="chip" onClick={() => void clear()}>clear</button>
          </div>
          <code className="smiles">{scaffold.smarts}</code>
          <p className="hint">{scaffold.about}</p>
          {presentInFocus === false && (
            <p className="warn">
              The focus molecule does not contain this group, so every candidate will fail
              the check. Pin something the starting molecule actually has.
            </p>
          )}
        </div>
      ) : (
        <p className="empty">Nothing pinned. Candidates are judged on properties alone.</p>
      )}
    </section>
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
          {focus.scaffoldMatch?.matched && (
            <p className="hint hint--mark">
              Shaded: the pinned group{focus.scaffoldMatch.count > 1
                ? ` (${focus.scaffoldMatch.count} occurrences, first one marked)`
                : ''}
            </p>
          )}
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

const STATUS_TONE = { pending: 'wait', accepted: 'ok', rejected: 'bad' } as const

function Board() {
  const candidates = useWorkbench((s) => s.candidates)
  const goal = useWorkbench((s) => s.goal)
  const setGoal = useWorkbench((s) => s.setGoal)
  const scaffold = useWorkbench((s) => s.scaffold)
  const decide = useWorkbench((s) => s.decide)
  const note = useWorkbench((s) => s.note)

  const judge = (candidate: Candidate, status: 'accepted' | 'rejected') => {
    decide(candidate.id, status)
    note({
      actor: 'human',
      tool: status === 'accepted' ? 'accept_candidate' : 'reject_candidate',
      detail: candidate.properties.canonicalSmiles,
      ok: status === 'accepted',
    })
  }

  const pendingCount = candidates.filter((c) => c.status === 'pending').length

  return (
    <section className="panel">
      <h2>Design board</h2>
      <input
        className="goal"
        value={goal}
        placeholder="Design goal, e.g. more water-soluble, keep the amide intact"
        onChange={(e) => setGoal(e.target.value)}
      />
      {pendingCount > 0 && (
        <p className="hint">
          {pendingCount} proposal{pendingCount > 1 ? 's' : ''} waiting on you. Nothing
          becomes the focus molecule until you accept it.
        </p>
      )}
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
            className={
              'card' +
              (candidate.scaffoldOk === false ? ' card--broke' : '') +
              (candidate.status === 'rejected' ? ' card--rejected' : '')
            }
          >
            <header>
              <Badge label={candidate.source} tone={candidate.source === 'agent' ? 'wait' : 'ok'} />
              <Badge label={candidate.status} tone={STATUS_TONE[candidate.status]} />
              <Badge
                label={candidate.lipinski.passes ? 'Lipinski pass' : 'Lipinski fail'}
                tone={candidate.lipinski.passes ? 'ok' : 'bad'}
              />
              {candidate.scaffoldOk !== null && scaffold && (
                <Badge
                  label={
                    candidate.scaffoldOk ? `${scaffold.label} kept` : `${scaffold.label} lost`
                  }
                  tone={candidate.scaffoldOk ? 'ok' : 'bad'}
                />
              )}
            </header>
            <div
              className="depiction depiction--sm"
              dangerouslySetInnerHTML={{ __html: candidate.svg }}
            />
            <code className="smiles">{candidate.properties.canonicalSmiles}</code>
            {candidate.rationale && <p className="rationale">{candidate.rationale}</p>}
            {candidate.scaffoldOk === false && scaffold && (
              <p className="violations">
                Does not contain the {scaffold.label} this design was supposed to keep.
              </p>
            )}
            <Properties p={candidate.properties} />
            <Scorecard candidate={candidate} />
            {!candidate.lipinski.passes && (
              <p className="violations">{candidate.lipinski.violations.join(' / ')}</p>
            )}
            {candidate.status === 'pending' && (
              <div className="decide">
                <button className="decide__yes" onClick={() => judge(candidate, 'accepted')}>
                  Accept
                </button>
                <button className="decide__no" onClick={() => judge(candidate, 'rejected')}>
                  Reject
                </button>
              </div>
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
        <h1>Analog <span className="topbar__sub">stage 1 - the referee</span></h1>
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
          <div className="column">
            <FocusPanel />
            <ScaffoldPanel />
          </div>
          <Board />
          <CallLog />
        </main>
      )}
    </div>
  )
}
