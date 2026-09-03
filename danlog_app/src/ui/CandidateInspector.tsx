import { useMemo } from 'react'
import { useWorkbench, type InspectTab } from '../store/workbench'
import type { Candidate, Molecule } from '../store/workbench'
import type { Properties } from '../chem/properties'
import { deltaFor, displayStatus } from '../chem/ranking'
import type { Ranked } from '../chem/ranking'
import { TOLERANCE } from '../chem/ledger'
import { describeSAScore, getSASeverity } from '../chem/sascore'
import { band } from '../chem/similarity'
import { Drawer, Metric, Row, StatusBadge, Tabs } from './primitives'
import {
  Alerts,
  ConstraintChecks,
  DeltaValue,
  Depiction,
  Groups,
  PropertyGrid,
  RulePills,
  Rules,
  Scorecard,
  TierLegend,
  Warnings,
} from './molecule'
import { Viewer3D } from '../Viewer3D'

/**
 * The inspection drawer.
 *
 * Everything the old candidate card carried lives here now: the full property
 * grid, the rule verdicts, the alerts, the scorecard, the constraint report.
 * Moving it off the card is what lets the card answer one question -- why is
 * this worth my attention -- instead of forty.
 */

const TABS: { key: InspectTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'properties', label: 'Properties' },
  { key: 'predictions', label: 'Predictions' },
  { key: 'synthesis', label: 'Synthesis' },
  { key: 'notes', label: 'Notes' },
]

/** The handful the eye actually compares, in the order a chemist reads them. */
const COMPARED: (keyof Properties)[] = [
  'mw',
  'logP',
  'tpsa',
  'hbd',
  'hba',
  'rotatableBonds',
  'fsp3',
  'logS',
]

function ComparisonTable({
  candidate,
  focus,
}: {
  candidate: Candidate
  focus: Molecule | null
}) {
  const constraints = useWorkbench((s) => s.constraints)
  const deltas = useMemo(
    () => COMPARED.map((key) => deltaFor(key, candidate.properties, focus?.properties ?? null, constraints)),
    [candidate.properties, focus, constraints],
  )

  return (
    <table className="cmp">
      <thead>
        <tr>
          <th>Property</th>
          <th>Focus</th>
          <th>Candidate</th>
          <th>Change</th>
        </tr>
      </thead>
      <tbody>
        {deltas.map((d) => (
          <tr key={d.key}>
            <td className="cmp__name">{d.label}</td>
            <td>{d.before ?? '—'}</td>
            <td className="cmp__value">{d.value}</td>
            <td>
              <DeltaValue delta={d} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function OverviewTab({ ranked, focus }: { ranked: Ranked; focus: Molecule | null }) {
  const { candidate } = ranked
  const scaffold = useWorkbench((s) => s.scaffold)
  const within = candidate.scorecard.filter(
    (r) => Math.abs(r.error) <= TOLERANCE[r.field],
  ).length

  return (
    <>
      {candidate.scaffoldOk === false && scaffold && (
        <p className="violations">
          Does not contain the {scaffold.label} this design was supposed to keep.
        </p>
      )}

      <Warnings p={candidate.properties} />

      <section className="drawer__section">
        <h3>Property comparison</h3>
        <ComparisonTable candidate={candidate} focus={focus} />
      </section>

      <div className="drawer__split">
        <section className="drawer__section">
          <h3>Drug-likeness</h3>
          <RulePills report={candidate.rules} />
        </section>

        <section className="drawer__section">
          <h3>Prediction validation</h3>
          {candidate.scorecard.length === 0 ? (
            <p className="hint">
              The agent committed to no numbers for this molecule, so there is nothing to check.
            </p>
          ) : (
            <>
              <p className="drawer__stat">
                <strong>
                  {within} / {candidate.scorecard.length}
                </strong>{' '}
                within tolerance
              </p>
              <Scorecard candidate={candidate} />
            </>
          )}
        </section>
      </div>

      <ConstraintChecks report={candidate.constraints} />
      <Alerts properties={candidate.properties} profile={candidate.profile} />

      {!candidate.rules.passes && (
        <p className="violations">{candidate.rules.violations.join(' / ')}</p>
      )}
    </>
  )
}

function PropertiesTab({ candidate }: { candidate: Candidate }) {
  return (
    <>
      <section className="drawer__section">
        <h3>All measures</h3>
        <PropertyGrid p={candidate.properties} />
        <TierLegend />
      </section>

      <section className="drawer__section">
        <h3>Solubility</h3>
        <p className="hint">
          {candidate.properties.logS} log mol/L (about {candidate.properties.solubilityMgPerL}{' '}
          mg/L) &mdash; {candidate.properties.solubilityBand}. Estimated, so treat it as a
          direction of travel, not a measurement.
        </p>
      </section>

      <section className="drawer__section">
        <h3>Functional groups</h3>
        <Groups groups={candidate.profile.groups} />
        {candidate.profile.groups.length === 0 && (
          <p className="hint">No catalogued groups matched.</p>
        )}
      </section>

      <section className="drawer__section">
        <h3>Rulesets</h3>
        <Rules report={candidate.rules} />
      </section>

      <section className="drawer__section">
        <h3>SMILES</h3>
        <code className="smiles">{candidate.properties.canonicalSmiles}</code>
      </section>
    </>
  )
}

function PredictionsTab({ candidate }: { candidate: Candidate }) {
  const p = candidate.properties
  return (
    <>
      <section className="drawer__section">
        <h3>Absorption &amp; distribution</h3>
        <div className="metrics">
          <Metric label="HIA" value={p.hiaScore} unit="%" title="Human intestinal absorption" />
          <Metric label="Oral F" value={p.oralBioavailability} unit="%" title="Estimated oral bioavailability" />
          <Metric label="BBB" value={p.bbaCrossing} unit="%" title="Blood-brain barrier crossing probability" />
          <Metric label="P-gp efflux" value={p.pgpEffluxLikelihood} unit="%" title="P-glycoprotein efflux risk" />
          <Metric label="Net BBB" value={p.netBrainPenetration} unit="%" title="Brain penetration after efflux" />
        </div>
      </section>

      <section className="drawer__section">
        <h3>Metabolism</h3>
        <div className="metrics">
          <Metric label="Stability" value={p.metabolicStability} unit="/100" title="Hepatic metabolic stability" />
          <Metric label="CYP3A4" value={p.cyp3a4Likelihood} unit="%" />
          <Metric label="CYP2D6" value={p.cyp2d6Likelihood} unit="%" />
          <Metric label="CYP2C9" value={p.cyp2c9Likelihood} unit="%" />
        </div>
        <Row label="Dominant enzyme">{p.dominantCYP}</Row>
        <Row label="Half-life">{p.halfLifeCategory}</Row>
      </section>

      <section className="drawer__section">
        <h3>Agent accuracy on this molecule</h3>
        {candidate.scorecard.length === 0 ? (
          <p className="hint">
            No prediction was stated before the oracle ran. Ask the agent for predicted_mw,
            predicted_logp and predicted_tpsa when it proposes, and its claim gets checked here.
          </p>
        ) : (
          <Scorecard candidate={candidate} />
        )}
      </section>

      <section className="drawer__section">
        <h3>Alerts</h3>
        <Alerts properties={p} profile={candidate.profile} />
        {candidate.profile.alerts.length === 0 && (
          <p className="hint">No structural alerts matched.</p>
        )}
      </section>
    </>
  )
}

function SynthesisTab({ candidate }: { candidate: Candidate }) {
  const sa = candidate.properties.saScore
  const severity = getSASeverity(sa)
  const smiles = candidate.properties.canonicalSmiles

  return (
    <>
      <section className="drawer__section">
        <h3>Synthetic accessibility</h3>
        <div className="sa">
          <div className="sa__score">
            <strong>{sa}</strong>
            <span>/ 10</span>
          </div>
          <div className="sa__meta">
            <StatusBadge
              label={describeSAScore(sa)}
              tone={severity === 'ok' ? 'ok' : severity === 'wait' ? 'warn' : 'bad'}
            />
            <p className="hint">
              Lower is easier. Estimated from molecular complexity and fragment contributions
              (Ertl), not from a retrosynthesis search &mdash; no synthetic route is proposed here.
            </p>
          </div>
        </div>
        <div className="sa__bar">
          <div className={'sa__fill sa__fill--' + severity} style={{ width: `${(sa / 10) * 100}%` }} />
        </div>
      </section>

      <section className="drawer__section">
        <h3>Complexity drivers</h3>
        <div className="metrics">
          <Metric label="Rings" value={candidate.properties.rings} />
          <Metric label="Ar. rings" value={candidate.properties.aromaticRings} />
          <Metric label="Fsp3" value={candidate.properties.fsp3} title="Fraction of sp3 carbons" />
          <Metric label="Heavy atoms" value={candidate.properties.heavyAtoms} />
          <Metric
            label="Stereocentres"
            value={candidate.properties.undefinedStereocentres}
            title="Undefined stereocentres"
          />
          <Metric label="RotB" value={candidate.properties.rotatableBonds} />
        </div>
      </section>

      <section className="drawer__section">
        <h3>3D structure</h3>
        <Viewer3D key={smiles} smiles={smiles} compact />
      </section>
    </>
  )
}

function NotesTab({ candidate }: { candidate: Candidate }) {
  const notes = useWorkbench((s) => s.candidateNotes)
  const setCandidateNote = useWorkbench((s) => s.setCandidateNote)
  const scaffold = useWorkbench((s) => s.scaffold)

  return (
    <>
      <section className="drawer__section">
        <h3>Agent rationale</h3>
        {candidate.rationale ? (
          <p className="rationale rationale--full">{candidate.rationale}</p>
        ) : (
          <p className="hint">The agent proposed this without stating a reason.</p>
        )}
      </section>

      <section className="drawer__section">
        <h3>Provenance</h3>
        <Row label="Proposed by">{candidate.source}</Row>
        <Row label="Created">{new Date(candidate.createdAt).toLocaleString()}</Row>
        {candidate.decidedAt && (
          <Row label="Decided">{new Date(candidate.decidedAt).toLocaleString()}</Row>
        )}
        {candidate.similarityToParent !== null && (
          <Row label="Similarity to parent">
            {candidate.similarityToParent} · {band(candidate.similarityToParent)}
          </Row>
        )}
        {scaffold && (
          <Row label={`${scaffold.label} preserved`}>
            {candidate.scaffoldOk === null ? '—' : candidate.scaffoldOk ? 'yes' : 'no'}
          </Row>
        )}
      </section>

      <section className="drawer__section">
        <h3>Your notes</h3>
        <textarea
          className="notes"
          value={notes[candidate.id] ?? ''}
          placeholder="What you want to remember about this molecule…"
          onChange={(e) => setCandidateNote(candidate.id, e.target.value)}
        />
        <p className="hint">
          Kept for this session only, and never shown to the agent.
        </p>
      </section>
    </>
  )
}

export function CandidateInspector({ ranked }: { ranked: Ranked[] }) {
  const inspectId = useWorkbench((s) => s.inspectId)
  const inspect = useWorkbench((s) => s.inspect)
  const tab = useWorkbench((s) => s.inspectTab)
  const setTab = useWorkbench((s) => s.setInspectTab)
  const focus = useWorkbench((s) => s.focus)
  const focusId = useWorkbench((s) => s.focusId)
  const decide = useWorkbench((s) => s.decide)
  const promote = useWorkbench((s) => s.promote)
  const note = useWorkbench((s) => s.note)
  const shortlist = useWorkbench((s) => s.shortlist)
  const toggleShortlist = useWorkbench((s) => s.toggleShortlist)

  const entry = ranked.find((r) => r.candidate.id === inspectId) ?? null
  const candidate = entry?.candidate ?? null

  const judge = (status: 'accepted' | 'rejected') => {
    if (!candidate) return
    decide(candidate.id, status)
    note({
      actor: 'human',
      tool: status === 'accepted' ? 'accept_candidate' : 'reject_candidate',
      detail: candidate.properties.canonicalSmiles,
      ok: status === 'accepted',
    })
    if (status === 'rejected') inspect(null)
  }

  const makeFocus = async () => {
    if (!candidate) return
    // Promoting implies approval. The gate stays human either way -- this is a
    // click by a person, not something a tool can reach.
    if (candidate.status !== 'accepted') {
      decide(candidate.id, 'accepted')
      note({
        actor: 'human',
        tool: 'accept_candidate',
        detail: candidate.properties.canonicalSmiles,
        ok: true,
      })
    }
    await promote(candidate.id)
    note({
      actor: 'human',
      tool: 'set_focus_molecule',
      detail: candidate.properties.canonicalSmiles,
      ok: true,
    })
    inspect(null)
  }

  // Nothing selected, or the selection was cleared by a board reset.
  if (!entry || !candidate) return null

  const isFocus = focusId === candidate.id
  const starred = shortlist.includes(candidate.id)
  const status = displayStatus(candidate, starred)

  return (
    <Drawer
      open
      onClose={() => inspect(null)}
      title={`Candidate ${String(entry.rank).padStart(2, '0')}`}
      badge={
        entry.label ? (
          <StatusBadge label={entry.label} tone="accent" />
        ) : (
          <StatusBadge label={status} tone={candidate.status === 'rejected' ? 'bad' : 'neutral'} />
        )
      }
      subtitle={
        <>
          <p className="drawer__name">{candidate.rationale || 'Proposed analog'}</p>
          <p className="drawer__headline">{entry.headline}</p>
        </>
      }
      footer={
        <>
          <button
            className="btn btn--primary"
            onClick={() => void makeFocus()}
            disabled={isFocus}
          >
            {isFocus ? '✓ Current focus molecule' : '✓ Make focus molecule'}
          </button>
          <button className="btn btn--ghost" onClick={() => toggleShortlist(candidate.id)}>
            {starred ? '★ Shortlisted' : '☆ Shortlist'}
          </button>
          {candidate.status !== 'rejected' ? (
            <button className="btn btn--danger" onClick={() => judge('rejected')}>
              ⊘ Reject
            </button>
          ) : (
            <button className="btn btn--ghost" onClick={() => judge('accepted')}>
              Restore
            </button>
          )}
        </>
      }
    >
      <Depiction svg={candidate.svg} size="lg" faded={candidate.status === 'rejected'} />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="drawer__panel">
        {tab === 'overview' && <OverviewTab ranked={entry} focus={focus} />}
        {tab === 'properties' && <PropertiesTab candidate={candidate} />}
        {tab === 'predictions' && <PredictionsTab candidate={candidate} />}
        {tab === 'synthesis' && <SynthesisTab candidate={candidate} />}
        {tab === 'notes' && <NotesTab candidate={candidate} />}
      </div>
    </Drawer>
  )
}
