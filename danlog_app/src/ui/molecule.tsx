import { MEASURES, TIER_ABOUT } from '../chem/measures'
import { generateBioavailabilityAlerts } from '../chem/bioavailability-alerts'
import type { Candidate } from '../store/workbench'
import type { Delta } from '../chem/ranking'
import { StatusBadge } from './primitives'

/**
 * Molecule read-outs, shared by every page and by the inspector.
 *
 * These are lifted unchanged from the original single-file board. The redesign
 * moves where they appear -- most of them now live inside the drawer rather
 * than on the card -- but not what they say, so a number cannot change meaning
 * just because it moved.
 */

const FIELD_LABEL = { mw: 'MW', logP: 'logP', tpsa: 'TPSA' } as const

export function Depiction({
  svg,
  size = 'md',
  faded,
}: {
  svg: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  faded?: boolean
}) {
  return (
    <div
      className={'depiction depiction--' + size + (faded ? ' depiction--faded' : '')}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

/**
 * Driven by MEASURES so the grid and the tool responses can never disagree
 * about what a number is or how far to trust it.
 */
export function PropertyGrid({ p }: { p: Candidate['properties'] }) {
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
export function TierLegend() {
  return (
    <p className="legend">
      <span className="legend__item legend__item--exact" title={TIER_ABOUT.exact}>
        exact
      </span>
      <span className="legend__item legend__item--computed" title={TIER_ABOUT.computed}>
        computed
      </span>
      <span className="legend__item legend__item--estimated" title={TIER_ABOUT.estimated}>
        estimated
      </span>
    </p>
  )
}

/** Every ruleset, each naming the clause that broke rather than just failing. */
export function Rules({ report }: { report: Candidate['rules'] }) {
  return (
    <ul className="rules">
      {report.rules.map((rule) => (
        <li key={rule.name} className={rule.passes ? 'rules__ok' : 'rules__bad'} title={rule.about}>
          <span className="rules__name">{rule.name}</span>
          <span className="rules__verdict">
            {rule.passes ? 'PASS' : rule.violations.join(', ')}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Reactive/interfering groups, bioavailability, and toxicity concerns. */
export function Alerts({
  properties,
  profile,
}: {
  properties: Candidate['properties']
  profile: Candidate['profile']
}) {
  const structuralAlerts = profile.alerts
  const bioavailabilityAlerts = generateBioavailabilityAlerts(properties, profile)
  const allAlerts = [...structuralAlerts, ...bioavailabilityAlerts]

  if (allAlerts.length === 0) return null
  return (
    <ul className="alerts">
      {allAlerts.map((a) => (
        <li key={a.label} className={'alerts__item alerts__item--' + a.severity}>
          <strong>{a.label}</strong> {a.why}
        </li>
      ))}
    </ul>
  )
}

export function Groups({ groups }: { groups: Candidate['profile']['groups'] }) {
  if (groups.length === 0) return null
  return (
    <p className="groups">
      {groups.map((g) => (
        <span key={g.label} className="groups__tag" title={g.about}>
          {g.label}
          {g.count > 1 && <span className="groups__n">{g.count}</span>}
        </span>
      ))}
    </p>
  )
}

/** Structural facts that are not numbers, e.g. an ambiguous stereocentre. */
export function Warnings({ p }: { p: Candidate['properties'] }) {
  if (p.undefinedStereocentres < 1) return null
  const n = p.undefinedStereocentres
  return (
    <p className="warn">
      {n} undefined stereocentre{n > 1 ? 's' : ''}: this SMILES describes {2 ** n} different
      compounds, not one. Properties are computed without stereochemistry.
    </p>
  )
}

/** How a molecule scores against what the human actually asked for. */
export function ConstraintChecks({ report }: { report: Candidate['constraints'] }) {
  if (report.total === 0) return null
  return (
    <div className="cbox">
      <p className={'cbox__score' + (report.allMet ? ' cbox__score--met' : '')}>
        Goals met {report.satisfied}/{report.total}
      </p>
      <ul className="cbox__list">
        {report.checks.map((c) => (
          <li key={c.key} className={c.satisfied ? 'cbox__ok' : 'cbox__bad'}>
            {c.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The point of the whole app: what the model claimed, beside what RDKit measured. */
export function Scorecard({ candidate }: { candidate: Candidate }) {
  if (!candidate.scorecard.length) return null
  return (
    <table className="ledger">
      <thead>
        <tr>
          <th>claimed</th>
          <th>measured</th>
          <th>error</th>
        </tr>
      </thead>
      <tbody>
        {candidate.scorecard.map((row) => {
          const wrong = Math.abs(row.error) > (row.field === 'logP' ? 0.5 : 5)
          return (
            <tr key={row.field} className={wrong ? 'ledger__row--wrong' : 'ledger__row--right'}>
              <td>
                {FIELD_LABEL[row.field]} {row.predicted}
              </td>
              <td>{row.actual}</td>
              <td>{row.error > 0 ? '+' + row.error : row.error}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Rule verdicts as three compact pass/fail pills, for the drawer overview. */
export function RulePills({ report }: { report: Candidate['rules'] }) {
  return (
    <div className="pills">
      {report.rules.map((rule) => (
        <div key={rule.name} className="pills__row" title={rule.about}>
          <span className="pills__name">{rule.name}</span>
          <StatusBadge
            label={rule.passes ? 'PASS' : 'FAIL'}
            tone={rule.passes ? 'ok' : 'bad'}
            title={rule.passes ? undefined : rule.violations.join(', ')}
          />
        </div>
      ))}
    </div>
  )
}

/**
 * One property's movement from the focus molecule. Grey when the app has no
 * honest opinion about which direction is better for that property.
 */
export function DeltaValue({ delta }: { delta: Delta }) {
  if (delta.change === null) return <span className="delta delta--none">&mdash;</span>
  const arrow = delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '→'
  const tone =
    delta.direction === 'flat' ? 'flat' : delta.good === null ? 'plain' : delta.good ? 'good' : 'bad'
  const magnitude = Math.abs(delta.change)
  return (
    <span className={'delta delta--' + tone}>
      {arrow} {magnitude.toFixed(2)}
    </span>
  )
}
