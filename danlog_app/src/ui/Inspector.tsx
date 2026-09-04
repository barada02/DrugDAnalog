import { useMemo, useState } from 'react'
import type { Shape } from '../chem/shape'
import { FOCUS_INSPECT_ID, useWorkbench, type InspectTab } from '../store/workbench'
import type { Candidate, Molecule } from '../store/workbench'
import { usePresetName } from './usePresetName'
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
 * Everything the old candidate card carried lives here: the full property
 * grid, the rule verdicts, the alerts, the scorecard, the constraint report.
 * Moving it off the card is what lets the card answer one question -- why is
 * this worth my attention -- instead of forty.
 *
 * It inspects the focus molecule too. Judging whether a candidate's shape or
 * rule profile is an improvement is impossible if the thing being improved on
 * is the one molecule you cannot open.
 */

/**
 * What the tabs actually need. A Candidate and a focus Molecule both satisfy
 * this, which is what lets one panel serve both without either pretending to
 * be the other.
 */
type Inspectable = {
  properties: Properties
  rules: Candidate['rules']
  profile: Candidate['profile']
  constraints: Candidate['constraints']
  svg: string
}

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

/**
 * The focus molecule has no parent to be compared against and no prediction
 * to be scored, so its Overview answers the question that is actually open:
 * where does the starting point already stand against the brief.
 */
function FocusOverviewTab({ focus }: { focus: Molecule }) {
  const scaffold = useWorkbench((s) => s.scaffold)
  const p = focus.properties

  return (
    <>
      <Warnings p={p} />

      {scaffold && focus.scaffoldMatch?.matched === false && (
        <p className="warn">
          This molecule does not contain the pinned {scaffold.label}, so every candidate will fail
          the check. Pin something the starting molecule actually has.
        </p>
      )}

      <section className="drawer__section">
        <h3>Key measures</h3>
        <div className="metrics">
          <Metric label="MW" value={p.mw} />
          <Metric label="LogP" value={p.logP} />
          <Metric label="TPSA" value={p.tpsa} />
          <Metric label="logS" value={p.logS} />
          <Metric label="SA" value={p.saScore} />
          <Metric label="HIA" value={p.hiaScore} unit="%" />
        </div>
        <p className="hint">
          These are the baseline every candidate's arrows are measured from.
        </p>
      </section>

      <section className="drawer__section">
        <h3>Drug-likeness</h3>
        <RulePills report={focus.rules} />
      </section>

      <ConstraintChecks report={focus.constraints} />
      <Alerts properties={p} profile={focus.profile} />

      {!focus.rules.passes && <p className="violations">{focus.rules.violations.join(' / ')}</p>}
    </>
  )
}

function PropertiesTab({ subject }: { subject: Inspectable }) {
  return (
    <>
      <section className="drawer__section">
        <h3>All measures</h3>
        <PropertyGrid p={subject.properties} />
        <TierLegend />
      </section>

      <section className="drawer__section">
        <h3>Solubility</h3>
        <p className="hint">
          {subject.properties.logS} log mol/L (about {subject.properties.solubilityMgPerL} mg/L)
          &mdash; {subject.properties.solubilityBand}. Estimated, so treat it as a direction of
          travel, not a measurement.
        </p>
      </section>

      <section className="drawer__section">
        <h3>Functional groups</h3>
        <Groups groups={subject.profile.groups} />
        {subject.profile.groups.length === 0 && (
          <p className="hint">No catalogued groups matched.</p>
        )}
      </section>

      <section className="drawer__section">
        <h3>Rulesets</h3>
        <Rules report={subject.rules} />
      </section>

      <section className="drawer__section">
        <h3>SMILES</h3>
        <code className="smiles">{subject.properties.canonicalSmiles}</code>
      </section>
    </>
  )
}

function PredictionsTab({
  subject,
  candidate,
}: {
  subject: Inspectable
  /** Null for the focus molecule: nothing predicted it, so nothing to score. */
  candidate: Candidate | null
}) {
  const p = subject.properties
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

      {candidate && (
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
      )}

      <section className="drawer__section">
        <h3>Alerts</h3>
        <Alerts properties={p} profile={subject.profile} />
        {subject.profile.alerts.length === 0 && (
          <p className="hint">No structural alerts matched.</p>
        )}
      </section>
    </>
  )
}

function SynthesisTab({ subject, shape }: { subject: Inspectable; shape: Shape | null }) {
  const sa = subject.properties.saScore
  const severity = getSASeverity(sa)

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
          <Metric label="Rings" value={subject.properties.rings} />
          <Metric label="Ar. rings" value={subject.properties.aromaticRings} />
          <Metric label="Fsp3" value={subject.properties.fsp3} title="Fraction of sp3 carbons" />
          <Metric label="Heavy atoms" value={subject.properties.heavyAtoms} />
          <Metric
            label="Stereocentres"
            value={subject.properties.undefinedStereocentres}
            title="Undefined stereocentres"
          />
          <Metric label="RotB" value={subject.properties.rotatableBonds} />
        </div>
      </section>

      <section className="drawer__section">
        <h3>Shape</h3>
        {shape ? (
          <>
            <dl className="props props--three">
              <div
                className="props__cell props__cell--estimated"
                title="Normalised principal moment ratios"
              >
                <dt>NPR1</dt>
                <dd>{shape.npr1}</dd>
              </div>
              <div className="props__cell props__cell--estimated">
                <dt>NPR2</dt>
                <dd>{shape.npr2}</dd>
              </div>
              <div
                className="props__cell props__cell--estimated"
                title="Longest interatomic distance"
              >
                <dt>Span</dt>
                <dd>{shape.span}</dd>
              </div>
            </dl>
            <p className="hint">
              Shape: <strong>{shape.descriptor}</strong>. Computed exactly from the coordinates in
              the 3D view above &mdash; but they are <em>one</em> conformer out of many this
              molecule can adopt, so treat the shape as indicative, not settled.
            </p>
          </>
        ) : (
          <p className="hint">
            Shape descriptors need 3D coordinates. Switch the view at the top of this panel to 3D
            and they appear here once the conformer arrives.
          </p>
        )}
      </section>
    </>
  )
}

function NotesTab({
  candidate,
  noteKey,
}: {
  candidate: Candidate | null
  /** Candidate id, or the focus sentinel, so notes survive tab switches. */
  noteKey: string
}) {
  const notes = useWorkbench((s) => s.candidateNotes)
  const setCandidateNote = useWorkbench((s) => s.setCandidateNote)
  const scaffold = useWorkbench((s) => s.scaffold)
  const goal = useWorkbench((s) => s.goal)

  return (
    <>
      <section className="drawer__section">
        <h3>{candidate ? 'Agent rationale' : 'Design goal'}</h3>
        {candidate ? (
          candidate.rationale ? (
            <p className="rationale rationale--full">{candidate.rationale}</p>
          ) : (
            <p className="hint">The agent proposed this without stating a reason.</p>
          )
        ) : goal ? (
          <p className="rationale rationale--full">{goal}</p>
        ) : (
          <p className="hint">No design goal set. Every candidate is judged on rules alone.</p>
        )}
      </section>

      <section className="drawer__section">
        <h3>Provenance</h3>
        {candidate ? (
          <>
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
          </>
        ) : (
          <>
            <Row label="Role">Starting point for this series</Row>
            {scaffold && <Row label="Pinned group">{scaffold.label}</Row>}
            <p className="hint">
              Loaded by you rather than proposed, so there is no agent claim to check against it.
            </p>
          </>
        )}
      </section>

      <section className="drawer__section">
        <h3>Your notes</h3>
        <textarea
          className="notes"
          value={notes[noteKey] ?? ''}
          placeholder="What you want to remember about this molecule…"
          onChange={(e) => setCandidateNote(noteKey, e.target.value)}
        />
        <p className="hint">Kept for this session only, and never shown to the agent.</p>
      </section>
    </>
  )
}

export function Inspector({ ranked }: { ranked: Ranked[] }) {
  const inspectId = useWorkbench((s) => s.inspectId)
  const inspect = useWorkbench((s) => s.inspect)
  const tab = useWorkbench((s) => s.inspectTab)
  const setTab = useWorkbench((s) => s.setInspectTab)
  const focus = useWorkbench((s) => s.focus)
  const focusId = useWorkbench((s) => s.focusId)
  const decide = useWorkbench((s) => s.decide)
  const removeCandidate = useWorkbench((s) => s.remove)
  const promote = useWorkbench((s) => s.promote)
  const note = useWorkbench((s) => s.note)
  const shortlist = useWorkbench((s) => s.shortlist)
  const toggleShortlist = useWorkbench((s) => s.toggleShortlist)

  // Which representation leads the panel. Sticky across candidates on purpose:
  // someone comparing shapes wants to stay in 3D as they walk the board.
  const [view, setView] = useState<'3d' | '2d'>('3d')

  const entry = ranked.find((r) => r.candidate.id === inspectId) ?? null
  const candidate = entry?.candidate ?? null
  // The focus molecule is inspectable on the same terms as its analogs. It is
  // not a Candidate -- no rank, no rationale, nothing predicted it -- so the
  // tabs take the fields both actually share.
  const focusSubject = inspectId === FOCUS_INSPECT_ID ? focus : null
  const subject: Inspectable | null = candidate ?? focusSubject
  const smiles = subject?.properties.canonicalSmiles ?? ''
  const noteKey = candidate?.id ?? FOCUS_INSPECT_ID
  const presetName = usePresetName(smiles || null)

  /**
   * Shape is lifted out of the viewer so the Synthesis tab can show the
   * descriptors while the 3D view stays at the top of the panel. It is stored
   * WITH the molecule it was measured from: in 2D there is no viewer mounted
   * to clear it, so an unqualified value would be attributed to whichever
   * candidate you opened next.
   */
  const [shapeOf, setShapeOf] = useState<{ smiles: string; shape: Shape | null } | null>(null)
  const shape = shapeOf?.smiles === smiles ? shapeOf.shape : null

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

  const destroy = () => {
    if (!candidate) return
    const children = ranked.filter((r) => r.candidate.parentId === candidate.id).length
    const ok = confirm(
      'Delete this candidate permanently?\n\n' +
        `${candidate.properties.canonicalSmiles}\n\n` +
        'Rejecting keeps it on the board as a decision you made and can be undone. ' +
        'Deleting cannot.' +
        (children > 0
          ? `\n\n${children} candidate${children === 1 ? '' : 's'} designed from it will be ` +
            'kept and reattached to its parent.'
          : ''),
    )
    if (!ok) return
    removeCandidate(candidate.id)
    note({
      actor: 'human',
      tool: 'delete_candidate',
      detail: candidate.properties.canonicalSmiles,
      ok: true,
    })
  }

  // Nothing selected, or the selection was cleared by a board reset.
  if (!subject) return null

  const isFocus = candidate !== null && focusId === candidate.id
  const starred = candidate !== null && shortlist.includes(candidate.id)
  const rejected = candidate?.status === 'rejected'

  return (
    <Drawer
      open
      variant="docked"
      onClose={() => inspect(null)}
      title={
        candidate && entry ? `Candidate ${String(entry.rank).padStart(2, '0')}` : 'Focus molecule'
      }
      badge={
        candidate && entry ? (
          entry.label ? (
            <StatusBadge label={entry.label} tone="accent" />
          ) : (
            <StatusBadge
              label={displayStatus(candidate, starred)}
              tone={rejected ? 'bad' : 'neutral'}
            />
          )
        ) : (
          <StatusBadge label="Starting point" tone="accent" />
        )
      }
      subtitle={
        candidate && entry ? (
          <>
            <p className="drawer__name">{candidate.rationale || 'Proposed analog'}</p>
            <p className="drawer__headline">{entry.headline}</p>
          </>
        ) : (
          <>
            <p className="drawer__name">{presetName ?? 'Custom molecule'}</p>
            <p className="drawer__headline">
              The molecule every candidate on this board is measured against.
            </p>
          </>
        )
      }
      footer={
        candidate ? (
          <div className="drawer__actions">
            <button
              className="btn btn--primary"
              onClick={() => void makeFocus()}
              disabled={isFocus}
            >
              {isFocus ? '✓ Current focus molecule' : '✓ Make focus molecule'}
            </button>
            <div className="drawer__actionrow">
              {/* Approving without promoting. Accepting says the idea is sound;
                  making it the focus says the next generation comes from it. */}
              {candidate.status === 'pending' && (
                <button className="btn btn--ok" onClick={() => judge('accepted')}>
                  ✓ Accept
                </button>
              )}
              {candidate.status === 'accepted' && !isFocus && (
                <span className="drawer__accepted" title="Approved, but not the focus molecule">
                  ✓ Accepted
                </span>
              )}
              <button className="btn btn--ghost" onClick={() => toggleShortlist(candidate.id)}>
                {starred ? '★' : '☆'} Shortlist
              </button>
              {!rejected ? (
                <button className="btn btn--danger" onClick={() => judge('rejected')}>
                  ⊘ Reject
                </button>
              ) : (
                <button className="btn btn--ghost" onClick={() => judge('accepted')}>
                  Restore
                </button>
              )}
              <button
                className="btn btn--icon btn--danger"
                onClick={destroy}
                title="Delete permanently"
                aria-label="Delete permanently"
              >
                🗑
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="hero">
        <div className="hero__switch" role="group" aria-label="Structure view">
          <button
            className={view === '3d' ? 'on' : ''}
            onClick={() => setView('3d')}
            aria-pressed={view === '3d'}
          >
            3D
          </button>
          <button
            className={view === '2d' ? 'on' : ''}
            onClick={() => setView('2d')}
            aria-pressed={view === '2d'}
          >
            2D
          </button>
        </div>

        {view === '3d' ? (
          // Keyed by molecule: a new subject gets a fresh fetch and a fresh
          // viewer rather than the previous molecule's coordinates.
          <Viewer3D
            key={smiles}
            smiles={smiles}
            compact
            showShape={false}
            onShape={(next) => setShapeOf({ smiles, shape: next })}
          />
        ) : (
          <Depiction svg={subject.svg} size="lg" faded={rejected} />
        )}
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="drawer__panel">
        {tab === 'overview' &&
          (candidate && entry ? (
            <OverviewTab ranked={entry} focus={focus} />
          ) : focusSubject ? (
            <FocusOverviewTab focus={focusSubject} />
          ) : null)}
        {tab === 'properties' && <PropertiesTab subject={subject} />}
        {tab === 'predictions' && <PredictionsTab subject={subject} candidate={candidate} />}
        {tab === 'synthesis' && <SynthesisTab subject={subject} shape={shape} />}
        {tab === 'notes' && <NotesTab candidate={candidate} noteKey={noteKey} />}
      </div>
    </Drawer>
  )
}
