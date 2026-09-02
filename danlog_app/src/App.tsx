import { useEffect, useState } from 'react'
import { getRDKit } from './chem/rdkit'
import { PRESETS } from './chem/properties'
import { GROUPS } from './chem/groups'
import { MEASURES } from './chem/measures'
import { band, diversity } from './chem/similarity'
import { buildLedger } from './chem/ledger'
import { download, toCsv, toSmiles } from './chem/export'
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

function Badge({ label, tone }: { label: string; tone: 'ok' | 'wait' | 'bad' }) {
  return <span className={'badge badge--' + tone}>{label}</span>
}

/**
 * Driven by MEASURES so the grid and the tool responses can never disagree
 * about what a number is or how far to trust it.
 */
function Properties({ p }: { p: Candidate['properties'] }) {
  return (
    <dl className="props">
      {MEASURES.map((m) => (
        <div key={m.key} className={'props__cell props__cell--' + m.tier} title={m.about}>
          <dt>{m.label}</dt>
          <dd>
            {p[m.key]}
            {m.error !== undefined && <span className="props__err">&plusmn;{m.error}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** What the shading on the property grid means. */
function TierLegend() {
  return (
    <p className="legend">
      <span className="legend__item legend__item--exact">exact</span>
      <span className="legend__item legend__item--computed">computed</span>
      <span className="legend__item legend__item--estimated">estimated</span>
    </p>
  )
}

/** Every ruleset, each naming the clause that broke rather than just failing. */
function Rules({ report }: { report: Candidate['rules'] }) {
  return (
    <ul className="rules">
      {report.rules.map((rule) => (
        <li key={rule.name} className={rule.passes ? 'rules__ok' : 'rules__bad'} title={rule.about}>
          <span className="rules__name">{rule.name}</span>
          <span className="rules__verdict">
            {rule.passes ? 'pass' : rule.violations.join(', ')}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Structural facts that are not numbers, e.g. an ambiguous stereocentre. */
function Warnings({ p }: { p: Candidate['properties'] }) {
  if (p.undefinedStereocentres < 1) return null
  const n = p.undefinedStereocentres
  return (
    <p className="warn">
      {n} undefined stereocentre{n > 1 ? 's' : ''}: this SMILES describes {2 ** n} different
      compounds, not one. Properties are computed without stereochemistry.
    </p>
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
          <TierLegend />
          <p className="hint">
            Solubility {focus.properties.logS} log mol/L (about{' '}
            {focus.properties.solubilityMgPerL} mg/L) &mdash; {focus.properties.solubilityBand}.
            Estimated, so treat it as a direction of travel, not a measurement.
          </p>
          <Warnings p={focus.properties} />
          <Rules report={focus.rules} />
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
  const reset = useWorkbench((s) => s.reset)
  const promote = useWorkbench((s) => s.promote)
  const focusId = useWorkbench((s) => s.focusId)
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

  const designFrom = async (candidate: Candidate) => {
    await promote(candidate.id)
    note({
      actor: 'human',
      tool: 'set_focus_molecule',
      detail: candidate.properties.canonicalSmiles,
      ok: true,
    })
  }

  const pendingCount = candidates.filter((c) => c.status === 'pending').length
  // Diversity over what survived: rejected ideas should not flatter the number.
  const alive = candidates.filter((c) => c.status !== 'rejected')
  const spread = diversity(alive.map((c) => c.fp))

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
      {candidates.length > 0 && (
        <div className="presets">
          <button
            className="chip"
            onClick={() => download('analog-board.csv', toCsv(candidates), 'text/csv')}
          >
            Export CSV
          </button>
          <button
            className="chip"
            onClick={() =>
              download('analog-board.smi', toSmiles(candidates), 'chemical/x-daylight-smiles')
            }
          >
            Export SMILES
          </button>
          <button
            className="chip"
            onClick={() => {
              if (confirm('Clear the board and the saved session? This cannot be undone.')) {
                reset()
                void useWorkbench.getState().setFocus(PRESETS[0].smiles)
              }
            }}
          >
            Clear board
          </button>
        </div>
      )}
      {spread !== null && (
        <p className="hint">
          Board diversity {spread} &mdash;{' '}
          {spread < 0.3
            ? 'these are variations on one idea, not separate ideas.'
            : 'a genuine spread of chemistry.'}
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
                label={
                  candidate.rules.passes
                    ? 'all rules pass'
                    : candidate.rules.failed.map((r) => r.name).join(' + ') + ' fail'
                }
                tone={candidate.rules.passes ? 'ok' : 'bad'}
              />
              {candidate.similarityToParent !== null && (
                <Badge
                  label={`${band(candidate.similarityToParent)} ${candidate.similarityToParent}`}
                  tone={candidate.similarityToParent >= 0.35 ? 'ok' : 'wait'}
                />
              )}
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
            <Warnings p={candidate.properties} />
            <Properties p={candidate.properties} />
            <Scorecard candidate={candidate} />
            {!candidate.rules.passes && (
              <p className="violations">{candidate.rules.violations.join(' / ')}</p>
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
            {candidate.status === 'accepted' && (
              <div className="decide">
                <button
                  disabled={focusId === candidate.id}
                  onClick={() => void designFrom(candidate)}
                >
                  {focusId === candidate.id ? 'Current focus' : 'Design from this'}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

/**
 * How often the agent's stated expectations survived contact with RDKit.
 * Produced as a side effect of ordinary work, which is what makes it evidence
 * rather than opinion.
 */
function AccuracyLedger() {
  const candidates = useWorkbench((s) => s.candidates)
  const ledger = buildLedger(candidates)

  if (ledger.hitRate === null) {
    return (
      <section className="panel">
        <h2>Prediction ledger</h2>
        <p className="empty">
          Nothing predicted yet. Ask your agent to state its expected logP{' '}
          <em>before</em> computing, and its accuracy gets tracked here.
        </p>
      </section>
    )
  }

  return (
    <section className="panel">
      <h2>Prediction ledger</h2>
      <p className="ledger__headline">
        <strong>{ledger.within}</strong> of <strong>{ledger.attempts}</strong> predictions
        landed inside tolerance
      </p>
      <table className="ledger">
        <thead>
          <tr><th>property</th><th>hit</th><th>mean err</th><th>worst</th></tr>
        </thead>
        <tbody>
          {ledger.fields.map((f) => (
            <tr key={f.field} className={f.within === f.attempts ? 'ledger__row--right' : ''}>
              <td>{f.label}</td>
              <td>{f.within}/{f.attempts}</td>
              <td>{f.meanAbsError}</td>
              <td>{f.worst}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/**
 * The design path. Candidates hang off the candidate they were designed from,
 * so what looks like a flat board is actually a tree, and the route that got
 * you here is visible.
 */
function Lineage() {
  const candidates = useWorkbench((s) => s.candidates)
  const focusId = useWorkbench((s) => s.focusId)
  const focus = useWorkbench((s) => s.focus)

  if (candidates.length === 0) return null

  const childrenOf = (parentId: string | null) =>
    candidates.filter((c) => c.parentId === parentId).sort((a, b) => a.createdAt - b.createdAt)

  const render = (parentId: string | null, depth: number): React.ReactNode[] =>
    childrenOf(parentId).flatMap((candidate) => [
      <li
        key={candidate.id}
        className={'tree__node tree__node--' + candidate.status}
        style={{ paddingLeft: depth * 14 }}
      >
        <span className="tree__mark">{focusId === candidate.id ? '◉' : '└'}</span>
        <code>{candidate.properties.canonicalSmiles}</code>
        <span className="tree__meta">
          logP {candidate.properties.logP} &middot; logS {candidate.properties.logS}
        </span>
      </li>,
      ...render(candidate.id, depth + 1),
    ])

  return (
    <section className="panel">
      <h2>Design path</h2>
      <ul className="tree">
        <li className="tree__node tree__node--root">
          <span className="tree__mark">{focusId === null ? '◉' : '○'}</span>
          <code>{focus?.properties.canonicalSmiles ?? 'starting molecule'}</code>
          <span className="tree__meta">start</span>
        </li>
        {render(null, 1)}
      </ul>
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
          <div className="column">
            <AccuracyLedger />
            <Lineage />
            <CallLog />
          </div>
        </main>
      )}
    </div>
  )
}
