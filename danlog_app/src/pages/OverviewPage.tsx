import { useMemo } from 'react'
import { FOCUS_INSPECT_ID, useWorkbench } from '../store/workbench'
import type { LogEntry } from '../store/workbench'
import { buildLedger } from '../chem/ledger'
import { diversity } from '../chem/similarity'
import { briefProgress } from '../chem/progress'
import { deltaFor, rankLabel, type Ranked } from '../chem/ranking'
import { EmptyState, Metric, SectionHead, StatusBadge } from '../ui/primitives'
import { DeltaValue, Depiction } from '../ui/molecule'
import { LineChart, SERIES_COLORS, type LineSeries } from '../ui/charts'
import { shortName } from '../ui/CandidateCard'
import { usePresetName } from '../ui/usePresetName'
import { useIupacName } from '../ui/useIupacName'

/**
 * Overview: where the project stands, and what is waiting on you.
 *
 * It used to be the Design page in miniature -- the same focus molecule block
 * and the same candidate cards, one page earlier. Nothing here draws a
 * molecule at any size now. The two questions this page exists to answer are
 * "am I blocked" and "are we getting closer", and neither is answered by
 * looking at a structure again.
 */

// --- what needs the human ----------------------------------------------------

type Action = {
  key: string
  tone: 'warn' | 'info'
  text: string
  cta: string
  go: () => void
}

function NeedsYou() {
  const candidates = useWorkbench((s) => s.candidates)
  const goal = useWorkbench((s) => s.goal)
  const constraints = useWorkbench((s) => s.constraints)
  const scaffold = useWorkbench((s) => s.scaffold)
  const focus = useWorkbench((s) => s.focus)
  const setPage = useWorkbench((s) => s.setPage)
  const inspect = useWorkbench((s) => s.inspect)

  const pending = candidates.filter((c) => c.status === 'pending')
  const broke = candidates.filter((c) => c.scaffoldOk === false && c.status !== 'rejected')
  const actions: Action[] = []

  // Ordered by how much they block the work, not by how easy they are to fix.
  if (pending.length > 0) {
    actions.push({
      key: 'pending',
      tone: 'warn',
      text: `${pending.length} proposal${pending.length === 1 ? '' : 's'} waiting on your decision. Nothing advances until you accept or reject.`,
      cta: 'Review',
      go: () => {
        inspect(pending[0].id)
        setPage('design')
      },
    })
  }

  if (broke.length > 0 && scaffold) {
    actions.push({
      key: 'scaffold',
      tone: 'warn',
      text: `${broke.length} candidate${broke.length === 1 ? '' : 's'} dropped the ${scaffold.label} you pinned, so ${broke.length === 1 ? 'it cannot' : 'they cannot'} satisfy the brief as written.`,
      cta: 'Show me',
      go: () => setPage('explore'),
    })
  }

  if (!focus) {
    actions.push({
      key: 'focus',
      tone: 'warn',
      text: 'No focus molecule loaded, so there is nothing to design from.',
      cta: 'Load one',
      go: () => setPage('design'),
    })
  } else if (candidates.length === 0) {
    actions.push({
      key: 'empty',
      tone: 'info',
      text: 'No analogs yet. Ask your agent for some, and to predict logP before it computes it.',
      cta: 'Open board',
      go: () => setPage('design'),
    })
  }

  if (!goal.trim()) {
    actions.push({
      key: 'goal',
      tone: 'info',
      text: 'No design goal written down. The agent works better against a stated intent than an implied one.',
      cta: 'Write one',
      go: () => setPage('design'),
    })
  }

  if (constraints.length === 0) {
    actions.push({
      key: 'target',
      tone: 'info',
      text: 'No target profile set, so candidates are judged on generic drug-likeness rather than on what you actually want.',
      cta: 'Set one',
      go: () => setPage('design'),
    })
  }

  if (actions.length === 0) {
    return (
      <section className="surface needs--clear">
        <span className="needs__tick" aria-hidden="true">
          ✓
        </span>
        <div>
          <h2>Nothing is waiting on you.</h2>
          <p className="hint">
            Every proposal has a decision and the brief is set. Ask the agent for another round
            when you are ready.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="surface">
      <SectionHead
        title="Needs you"
        count={<StatusBadge label={String(actions.length)} tone="warn" />}
      />
      <ul className="needs">
        {actions.map((a) => (
          <li key={a.key} className={'needs__item needs__item--' + a.tone}>
            <span className="needs__mark" aria-hidden="true">
              {a.tone === 'warn' ? '!' : 'i'}
            </span>
            <span className="needs__text">{a.text}</span>
            <button className="btn btn--outline" onClick={a.go}>
              {a.cta}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// --- progress toward the brief -----------------------------------------------

function Progress() {
  const candidates = useWorkbench((s) => s.candidates)
  const focusId = useWorkbench((s) => s.focusId)
  const constraints = useWorkbench((s) => s.constraints)
  const setPage = useWorkbench((s) => s.setPage)

  const promotedIds = useMemo(() => {
    const ids = new Set<string>()
    let id: string | null = focusId
    while (id && !ids.has(id)) {
      ids.add(id)
      id = candidates.find((c) => c.id === id)?.parentId ?? null
    }
    return ids
  }, [candidates, focusId])

  const progress = useMemo(
    () =>
      briefProgress({
        candidates,
        promotedIds,
        usingGoals: constraints.length > 0,
      }),
    [candidates, promotedIds, constraints],
  )

  const moved =
    progress.latest !== null && progress.first !== null && progress.labels.length > 1
      ? Math.round((progress.latest - progress.first) * 100)
      : null

  const series: LineSeries[] = [
    { name: 'Best in generation', color: SERIES_COLORS[0], points: progress.best },
  ]
  if (progress.promoted.some((p) => p !== null)) {
    series.push({
      name: 'Promoted',
      color: SERIES_COLORS[1],
      points: progress.promoted,
      dashed: true,
    })
  }

  return (
    <section className="surface">
      <SectionHead
        title={progress.measuring === 'goals' ? 'Progress toward your target' : 'Drug-likeness'}
      >
        <button className="btn btn--ghost" onClick={() => setPage('evolution')}>
          See evolution
        </button>
      </SectionHead>

      {progress.labels.length === 0 ? (
        <EmptyState title="Nothing to measure yet.">
          <p>This fills in once the agent has proposed a generation.</p>
        </EmptyState>
      ) : (
        <>
          <p className="bignum">
            <strong>
              {progress.latest === null ? '—' : `${Math.round(progress.latest * 100)}%`}
            </strong>
            <span>
              {progress.measuring === 'goals'
                ? 'of your target profile met by the best candidate'
                : 'of the drug-likeness rulesets passed by the best candidate'}
              {moved !== null && (
                <em className={moved > 0 ? 'up' : moved < 0 ? 'down' : ''}>
                  {moved > 0
                    ? `up ${moved} points`
                    : moved < 0
                      ? `down ${-moved} points`
                      : 'flat'}{' '}
                  since the first generation
                </em>
              )}
            </span>
          </p>
          <LineChart labels={progress.labels} series={series} height={148} />
          {progress.measuring === 'rules' && (
            <p className="hint">
              No target profile is set, so this tracks the four generic rulesets instead. Set one
              on the Design page to measure against what you actually want.
            </p>
          )}
        </>
      )}
    </section>
  )
}

// --- vitals ------------------------------------------------------------------

function Vitals({ ranked }: { ranked: Ranked[] }) {
  const candidates = useWorkbench((s) => s.candidates)
  const shortlist = useWorkbench((s) => s.shortlist)

  const accepted = candidates.filter((c) => c.status === 'accepted').length
  const rejected = candidates.filter((c) => c.status === 'rejected').length
  const pending = candidates.filter((c) => c.status === 'pending').length
  const alive = candidates.filter((c) => c.status !== 'rejected')
  const spread = diversity(alive.map((c) => c.fp))
  const generations = ranked.length ? Math.max(...ranked.map((r) => r.generation)) : 0

  return (
    <section className="surface">
      <SectionHead title="Board" />
      <div className="metrics">
        <Metric label="Candidates" value={candidates.length} />
        <Metric label="Generations" value={generations} />
        <Metric label="Awaiting you" value={pending} tone={pending > 0 ? 'warn' : undefined} />
        <Metric label="Accepted" value={accepted} tone={accepted > 0 ? 'ok' : undefined} />
        <Metric label="Rejected" value={rejected} />
        <Metric label="Shortlisted" value={shortlist.length} />
        <Metric label="Diversity" value={spread ?? '—'} title="Mean pairwise distance" />
      </div>
      {spread !== null && (
        <p className="hint">
          {spread < 0.3
            ? 'These are variations on one idea, not separate ideas — worth asking for a different scaffold.'
            : 'A genuine spread of chemistry.'}
        </p>
      )}
    </section>
  )
}

// --- leaders, as a list rather than a second board ---------------------------

function Leaders({ ranked }: { ranked: Ranked[] }) {
  const focus = useWorkbench((s) => s.focus)
  const constraints = useWorkbench((s) => s.constraints)
  const inspect = useWorkbench((s) => s.inspect)
  const setPage = useWorkbench((s) => s.setPage)

  const top = ranked.filter((r) => r.candidate.status !== 'rejected').slice(0, 5)
  if (top.length === 0) return null

  return (
    <section className="surface">
      <SectionHead title="Leading candidates">
        <button className="btn btn--ghost" onClick={() => setPage('design')}>
          Open the board
        </button>
      </SectionHead>
      <ol className="ranklist">
        {top.map((entry) => {
          const delta = deltaFor(
            'logS',
            entry.candidate.properties,
            focus?.properties ?? null,
            constraints,
          )
          return (
            <li key={entry.candidate.id}>
              <span className="ranklist__rank">{rankLabel(entry.rank)}</span>
              <span className="ranklist__thumb">
                <Depiction svg={entry.candidate.svg} size="xs" />
              </span>
              <span className="ranklist__body">
                <strong>{shortName(entry.candidate)}</strong>
                <span className="hint">{entry.headline}</span>
              </span>
              {entry.label && <StatusBadge label={entry.label} tone="accent" />}
              <span className="ranklist__delta">
                logS <DeltaValue delta={delta} />
              </span>
              <button className="btn btn--outline" onClick={() => inspect(entry.candidate.id)}>
                Inspect
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// --- activity ----------------------------------------------------------------

/** Plumbing rather than design history: true of the runtime, not the project. */
const NOT_HISTORY = new Set(['rdkit', 'fetch_3d', 'restore'])

const PHRASING: Record<string, (detail: string) => string> = {
  set_focus_molecule: (d) => `made ${d} the focus molecule`,
  propose_candidate: (d) => `proposed ${d}`,
  accept_candidate: (d) => `accepted ${d}`,
  reject_candidate: (d) => `rejected ${d}`,
  delete_candidate: (d) => `deleted ${d}`,
  pin_scaffold: (d) => (d === 'cleared' ? 'cleared the pinned group' : `pinned the ${d.split('  ')[0]}`),
  set_target_profile: (d) => `set the target profile to ${d}`,
  export_evolution: (d) => `exported the evolution report (${d})`,
}

/** SMILES are long and this is a history, not a record. */
const trim = (text: string) => (text.length > 32 ? text.slice(0, 30) + '…' : text)

function say(entry: LogEntry): string {
  const phrase = PHRASING[entry.tool]
  if (phrase) return phrase(trim(entry.detail))
  return `${entry.tool.replaceAll('_', ' ')} ${trim(entry.detail)}`.trim()
}

function ago(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(at).toLocaleDateString()
}

function Activity() {
  const log = useWorkbench((s) => s.log)
  const setTraceOpen = useWorkbench((s) => s.setTraceOpen)

  const history = log.filter((e) => !NOT_HISTORY.has(e.tool)).slice(0, 8)

  return (
    <section className="surface">
      <SectionHead title="Recent activity">
        <button className="btn btn--ghost" onClick={() => setTraceOpen(true)}>
          Full trace
        </button>
      </SectionHead>
      {history.length === 0 ? (
        <EmptyState title="Nothing has happened yet.">
          <p>Decisions, yours and the agent's, appear here as they are made.</p>
        </EmptyState>
      ) : (
        <ul className="activity">
          {history.map((entry) => (
            <li key={entry.id} className={entry.ok ? undefined : 'activity__row--failed'}>
              <span className={'activity__who activity__who--' + entry.actor}>
                {entry.actor === 'agent' ? 'Agent' : 'You'}
              </span>
              <span className="activity__what">{say(entry)}</span>
              <span className="activity__when">{ago(entry.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// --- prediction ledger -------------------------------------------------------

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
      <section className="surface">
        <SectionHead title="Prediction ledger" />
        <EmptyState title="Nothing predicted yet.">
          <p>
            Ask your agent to state its expected logP <em>before</em> computing, and its accuracy
            gets tracked here.
          </p>
        </EmptyState>
      </section>
    )
  }

  return (
    <section className="surface">
      <SectionHead title="Prediction ledger" />
      <p className="bignum">
        <strong>{Math.round(ledger.hitRate * 100)}%</strong>
        <span>
          of the agent's stated numbers landed inside tolerance
          <em>
            {ledger.within} of {ledger.attempts} predictions checked
          </em>
        </span>
      </p>
      <table className="ledger">
        <thead>
          <tr>
            <th>property</th>
            <th>hit</th>
            <th>mean err</th>
            <th>worst</th>
          </tr>
        </thead>
        <tbody>
          {ledger.fields.map((f) => (
            <tr key={f.field} className={f.within === f.attempts ? 'ledger__row--right' : ''}>
              <td>{f.label}</td>
              <td>
                {f.within}/{f.attempts}
              </td>
              <td>{f.meanAbsError}</td>
              <td>{f.worst}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

// --- page --------------------------------------------------------------------

function ProjectStrip() {
  const focus = useWorkbench((s) => s.focus)
  const goal = useWorkbench((s) => s.goal)
  const scaffold = useWorkbench((s) => s.scaffold)
  const constraints = useWorkbench((s) => s.constraints)
  const inspect = useWorkbench((s) => s.inspect)
  const smiles = focus?.properties.canonicalSmiles ?? null
  const preset = usePresetName(smiles)
  const iupac = useIupacName(smiles)

  if (!focus) return null

  return (
    <section className="surface projectstrip">
      <div className="projectstrip__id">
        <span className="projectstrip__label">Designing from</span>
        <h2>{preset ?? iupac ?? 'Custom molecule'}</h2>
        <code className="smiles">{focus.properties.canonicalSmiles}</code>
      </div>

      <div className="projectstrip__goal">
        <span className="projectstrip__label">Goal</span>
        <p className={goal ? undefined : 'brief__goal--empty'}>{goal || 'Not stated.'}</p>
        {(scaffold || constraints.length > 0) && (
          <div className="brief__tags">
            {scaffold && <span className="tag tag--pin">{scaffold.label}</span>}
            {constraints.map((c) => (
              <span key={c.key} className="tag">
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn--outline" onClick={() => inspect(FOCUS_INSPECT_ID)}>
        Inspect
      </button>
    </section>
  )
}

export function OverviewPage({ ranked }: { ranked: Ranked[] }) {
  return (
    <div className="page">
      <div className="pagehead">
        <h1>Overview</h1>
        <p>Where this project stands, and what is waiting on you.</p>
      </div>

      <ProjectStrip />
      <NeedsYou />

      <div className="overviewlayout">
        <Progress />
        <Vitals ranked={ranked} />
      </div>

      <Leaders ranked={ranked} />

      <div className="overviewlayout">
        <Activity />
        <AccuracyLedger />
      </div>
    </div>
  )
}
