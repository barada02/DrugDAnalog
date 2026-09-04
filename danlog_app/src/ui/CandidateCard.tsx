import { useMemo } from 'react'
import { useWorkbench } from '../store/workbench'
import type { Candidate, Molecule } from '../store/workbench'
import type { Properties } from '../chem/properties'
import { deltaFor, displayStatus, rankLabel } from '../chem/ranking'
import type { Ranked } from '../chem/ranking'
import { getSASeverity } from '../chem/sascore'
import { DeltaValue, Depiction } from './molecule'
import { StatusBadge } from './primitives'
import { useIupacName } from './useIupacName'

/**
 * One candidate, reduced to the question that matters: is this worth opening?
 *
 * The card deliberately shows three property movements and three verdict
 * numbers. Everything else -- the other sixteen measures, the four rulesets,
 * the alerts, the scorecard -- is one click away in the drawer. A card that
 * shows everything ranks nothing.
 */

/** The three the eye can actually compare across a row of cards. */
const CARD_DELTAS: (keyof Properties)[] = ['logS', 'logP', 'tpsa']

/** First clause of the agent's rationale, used as the transformation's name. */
export function shortName(c: Candidate): string {
  const text = c.rationale.trim()
  if (!text) return 'Proposed analog'
  const first = text.split(/[.;\n]/)[0].trim()
  if (!first) return 'Proposed analog'
  return first.length > 46 ? first.slice(0, 44).trimEnd() + '…' : first
}

export function CandidateCard({
  entry,
  focus,
  compact = false,
}: {
  entry: Ranked
  focus: Molecule | null
  compact?: boolean
}) {
  const { candidate } = entry
  const constraints = useWorkbench((s) => s.constraints)
  const inspect = useWorkbench((s) => s.inspect)
  const inspectId = useWorkbench((s) => s.inspectId)
  const focusId = useWorkbench((s) => s.focusId)
  const shortlist = useWorkbench((s) => s.shortlist)
  const toggleShortlist = useWorkbench((s) => s.toggleShortlist)
  const compareIds = useWorkbench((s) => s.compareIds)
  const toggleCompare = useWorkbench((s) => s.toggleCompare)
  const iupac = useIupacName(candidate.properties.canonicalSmiles)

  const deltas = useMemo(
    () =>
      CARD_DELTAS.map((key) =>
        deltaFor(key, candidate.properties, focus?.properties ?? null, constraints),
      ),
    [candidate.properties, focus, constraints],
  )

  const starred = shortlist.includes(candidate.id)
  const staged = compareIds.includes(candidate.id)
  const isFocus = focusId === candidate.id
  const open = inspectId === candidate.id
  const rejected = candidate.status === 'rejected'
  const saSeverity = getSASeverity(candidate.properties.saScore)
  const constraintsMet = candidate.constraints.total > 0 && candidate.constraints.allMet
  const broke = candidate.scaffoldOk === false

  return (
    <article
      className={
        'ccard' +
        (open ? ' ccard--open' : '') +
        (rejected ? ' ccard--rejected' : '') +
        (broke ? ' ccard--broke' : '') +
        (compact ? ' ccard--compact' : '')
      }
    >
      <header className="ccard__head">
        <span className="ccard__rank">{rankLabel(entry.rank)}</span>
        <span
          className="ccard__gen"
          title={`Generation ${entry.generation} — ${entry.generation === 1 ? 'designed from the starting molecule' : `${entry.generation - 1} promotion${entry.generation === 2 ? '' : 's'} deep`}`}
        >
          G{entry.generation}
        </span>
        {entry.label ? (
          <span className="ccard__label">{entry.label}</span>
        ) : (
          <span className="ccard__label ccard__label--muted">
            {displayStatus(candidate, starred)}
          </span>
        )}
        {entry.label && !rejected && <span className="ccard__ai">AI recommended</span>}
        <button
          className={'ccard__star' + (starred ? ' ccard__star--on' : '')}
          onClick={() => toggleShortlist(candidate.id)}
          title={starred ? 'Remove from shortlist' : 'Add to shortlist'}
          aria-label={starred ? 'Remove from shortlist' : 'Add to shortlist'}
        >
          {starred ? '★' : '☆'}
        </button>
      </header>

      <button
        className="ccard__figure"
        onClick={() => inspect(candidate.id)}
        aria-label={`Inspect candidate ${entry.rank}`}
      >
        <Depiction svg={candidate.svg} size="sm" faded={rejected} />
      </button>

      {/* The systematic name identifies the molecule; the agent's phrase says
          what it did. Both are useful, so the second becomes a subtitle rather
          than being displaced. */}
      <h3 className="ccard__name" title={iupac ?? candidate.rationale ?? undefined}>
        {iupac ?? shortName(candidate)}
      </h3>
      {iupac && candidate.rationale && (
        <p className="ccard__transform">{shortName(candidate)}</p>
      )}

      {entry.highlights.length > 0 && (
        <div className="ccard__chips">
          {entry.highlights.map((h) => (
            <span key={h.text} className={'chipx chipx--' + h.tone}>
              {h.text}
            </span>
          ))}
        </div>
      )}

      <div className="ccard__deltas">
        {deltas.map((d) => (
          <div key={d.key} className="ccard__delta">
            <span className="ccard__deltalabel">{d.label}</span>
            <span className="ccard__deltavalue">{d.value}</span>
            <DeltaValue delta={d} />
          </div>
        ))}
      </div>

      <div className="ccard__metrics">
        <div className={'ccard__metric ccard__metric--' + saSeverity}>
          <span>SA Score</span>
          <strong>{candidate.properties.saScore}</strong>
        </div>
        <div
          className={
            'ccard__metric ccard__metric--' +
            (candidate.properties.hiaScore >= 70
              ? 'ok'
              : candidate.properties.hiaScore >= 40
                ? 'wait'
                : 'bad')
          }
        >
          <span>HIA</span>
          <strong>{candidate.properties.hiaScore}%</strong>
        </div>
        <div className="ccard__metric ccard__metric--info">
          <span>BBB</span>
          <strong>{candidate.properties.bbaCrossing}</strong>
        </div>
      </div>

      <p className="ccard__status">
        {broke ? (
          <span className="ccard__bad">⚠ Pinned group lost</span>
        ) : constraintsMet ? (
          <span className="ccard__ok">✓ All constraints satisfied</span>
        ) : candidate.constraints.total > 0 ? (
          <span className="ccard__warn">
            ⚠ {candidate.constraints.satisfied}/{candidate.constraints.total} constraints met
          </span>
        ) : saSeverity === 'bad' ? (
          <span className="ccard__warn">⚠ Higher synthesis difficulty</span>
        ) : candidate.rules.passes ? (
          <span className="ccard__ok">✓ All rules pass</span>
        ) : (
          <span className="ccard__warn">
            ⚠ {candidate.rules.failed.map((r) => r.name).join(', ')}
          </span>
        )}
      </p>

      <footer className="ccard__foot">
        <button className="btn btn--outline" onClick={() => inspect(candidate.id)}>
          Inspect
        </button>
        <button
          className={'btn btn--icon' + (staged ? ' btn--icon-on' : '')}
          onClick={() => toggleCompare(candidate.id)}
          title={staged ? 'Remove from comparison' : 'Add to comparison'}
          aria-label={staged ? 'Remove from comparison' : 'Add to comparison'}
        >
          ⇄
        </button>
      </footer>

      {isFocus && <span className="ccard__focusflag">Current focus</span>}
    </article>
  )
}

/** The small node used in the evolution strip and the compare tray. */
export function MiniMolecule({
  svg,
  title,
  subtitle,
  status,
  tone = 'neutral',
  onClick,
  active,
}: {
  svg: string
  title: string
  subtitle?: string
  status?: string
  tone?: 'ok' | 'warn' | 'bad' | 'neutral' | 'accent'
  onClick?: () => void
  active?: boolean
}) {
  const inner = (
    <>
      <Depiction svg={svg} size="xs" />
      <span className="mini__title">{title}</span>
      {subtitle && <span className="mini__sub">{subtitle}</span>}
      {status && <StatusBadge label={status} tone={tone} />}
    </>
  )
  if (!onClick) return <div className={'mini' + (active ? ' mini--on' : '')}>{inner}</div>
  return (
    <button className={'mini' + (active ? ' mini--on' : '')} onClick={onClick}>
      {inner}
    </button>
  )
}
