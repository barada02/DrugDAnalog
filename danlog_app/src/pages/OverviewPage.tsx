import { FOCUS_INSPECT_ID, useWorkbench } from '../store/workbench'
import { buildLedger } from '../chem/ledger'
import { diversity } from '../chem/similarity'
import { rankLabel, type Ranked } from '../chem/ranking'
import { EmptyState, Metric, SectionHead, StatusBadge } from '../ui/primitives'
import { Depiction } from '../ui/molecule'
import { CandidateCard, shortName } from '../ui/CandidateCard'
import { usePresetName } from '../ui/usePresetName'

/**
 * Overview: the state of the project in one screen.
 *
 * This is where the prediction ledger belongs. It is a claim about the agent
 * rather than about any one molecule, so putting it beside a candidate always
 * made it look like a property of that candidate.
 */

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
      <p className="ledger__headline">
        <strong>{ledger.within}</strong> of <strong>{ledger.attempts}</strong> predictions landed
        inside tolerance
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

export function OverviewPage({ ranked }: { ranked: Ranked[] }) {
  const focus = useWorkbench((s) => s.focus)
  const candidates = useWorkbench((s) => s.candidates)
  const goal = useWorkbench((s) => s.goal)
  const shortlist = useWorkbench((s) => s.shortlist)
  const setPage = useWorkbench((s) => s.setPage)
  const inspect = useWorkbench((s) => s.inspect)
  const name = usePresetName(focus?.properties.canonicalSmiles ?? null)

  const pending = candidates.filter((c) => c.status === 'pending').length
  const accepted = candidates.filter((c) => c.status === 'accepted').length
  const rejected = candidates.filter((c) => c.status === 'rejected').length
  const alive = candidates.filter((c) => c.status !== 'rejected')
  const spread = diversity(alive.map((c) => c.fp))
  const top = ranked.filter((r) => r.candidate.status !== 'rejected').slice(0, 3)

  return (
    <div className="page">
      <div className="pagehead">
        <h1>Overview</h1>
        <p>Where this project stands, and what is waiting on you.</p>
      </div>

      <div className="overviewlayout">
        <section className="surface">
          <SectionHead title="Starting point" />
          {focus ? (
            <div className="focus__body">
              <div className="focus__figure">
                <button
                  className="focus__figurebtn"
                  onClick={() => inspect(FOCUS_INSPECT_ID)}
                  title="Inspect the focus molecule"
                  aria-label="Inspect the focus molecule"
                >
                  <Depiction svg={focus.svg} size="md" />
                </button>
              </div>
              <div className="focus__detail">
                <h3 className="focus__name">{name ?? 'Custom molecule'}</h3>
                <code className="smiles">{focus.properties.canonicalSmiles}</code>
                <p className={goal ? 'brief__goal' : 'brief__goal brief__goal--empty'}>
                  {goal || 'No design goal set yet.'}
                </p>
                <div className="metrics metrics__inline">
                  <Metric label="MW" value={focus.properties.mw} />
                  <Metric label="LogP" value={focus.properties.logP} />
                  <Metric label="TPSA" value={focus.properties.tpsa} />
                  <Metric label="logS" value={focus.properties.logS} />
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="No molecule loaded.">
              <button className="linkbtn" onClick={() => setPage('design')}>
                Load one on the Design page →
              </button>
            </EmptyState>
          )}
        </section>

        <section className="surface">
          <SectionHead title="Board" />
          <div className="metrics">
            <Metric label="Candidates" value={candidates.length} />
            <Metric label="Awaiting you" value={pending} tone={pending > 0 ? 'warn' : undefined} />
            <Metric label="Accepted" value={accepted} tone={accepted > 0 ? 'ok' : undefined} />
            <Metric label="Rejected" value={rejected} />
            <Metric label="Shortlisted" value={shortlist.length} />
            <Metric label="Diversity" value={spread ?? '—'} title="Mean pairwise distance" />
          </div>
          {spread !== null && (
            <p className="hint">
              {spread < 0.3
                ? 'These are variations on one idea, not separate ideas.'
                : 'A genuine spread of chemistry.'}
            </p>
          )}
          {pending > 0 && (
            <p className="hint">
              {pending} proposal{pending > 1 ? 's' : ''} still needs a decision.{' '}
              <button className="linkbtn" onClick={() => setPage('design')}>
                Review them →
              </button>
            </p>
          )}
        </section>
      </div>

      <section className="surface">
        <SectionHead title="Top recommendations" count={top.length > 0 ? rankLabel(top.length) : null}>
          {candidates.length > 0 && (
            <button className="btn btn--ghost" onClick={() => setPage('design')}>
              See all
            </button>
          )}
        </SectionHead>
        {top.length === 0 ? (
          <EmptyState title="No candidates yet." icon="⌬">
            <p>Ask your agent for analogs and they appear here, ranked.</p>
          </EmptyState>
        ) : (
          <div className="cgrid">
            {top.map((entry) => (
              <CandidateCard key={entry.candidate.id} entry={entry} focus={focus} />
            ))}
          </div>
        )}
      </section>

      {shortlist.length > 0 && (
        <section className="surface">
          <SectionHead title="Your shortlist" />
          <ul className="shortlist">
            {ranked
              .filter((r) => shortlist.includes(r.candidate.id))
              .map((entry) => (
                <li key={entry.candidate.id}>
                  <StatusBadge label={rankLabel(entry.rank)} tone="neutral" />
                  <strong>{shortName(entry.candidate)}</strong>
                  <span className="hint">{entry.headline}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <AccuracyLedger />
    </div>
  )
}
