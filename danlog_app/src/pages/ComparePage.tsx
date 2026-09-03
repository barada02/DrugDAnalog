import { useMemo } from 'react'
import { MAX_COMPARE, useWorkbench } from '../store/workbench'
import type { Candidate, Molecule } from '../store/workbench'
import type { Properties } from '../chem/properties'
import { measureFor } from '../chem/measures'
import { deltaFor, type Ranked } from '../chem/ranking'
import { EmptyState, SectionHead, StatusBadge } from '../ui/primitives'
import { DeltaValue, Depiction } from '../ui/molecule'
import { RadarChart, SERIES_COLORS, type RadarSeries } from '../ui/charts'
import { shortName } from '../ui/CandidateCard'
import { usePresetName } from '../ui/usePresetName'

/**
 * The Compare page.
 *
 * Its job is to end an argument, not to display a spreadsheet. The table gives
 * the numbers with the direction of travel marked, the radar gives the shape of
 * each trade-off at a glance, and the insight panel says out loud what the two
 * of them together imply.
 */

const ROWS: (keyof Properties)[] = [
  'mw',
  'logP',
  'tpsa',
  'logS',
  'hbd',
  'hba',
  'rotatableBonds',
  'fsp3',
  'saScore',
  'hiaScore',
  'bbaCrossing',
]

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

const AXES = ['Solubility', 'Lipophilicity', 'Permeability', 'Drug-likeness', 'Synthesis', '3D character']

function profileOf(p: Properties, rulesPassed: number, rulesTotal: number): number[] {
  return [
    clamp01((p.logS + 6) / 6),
    clamp01((p.logP + 1) / 6),
    clamp01(p.hiaScore / 100),
    rulesTotal === 0 ? 0 : rulesPassed / rulesTotal,
    clamp01((10 - p.saScore) / 10),
    clamp01(p.fsp3),
  ]
}

type Column = {
  id: string
  name: string
  sub: string
  svg: string
  properties: Properties
  rulesPassed: number
  rulesTotal: number
  isFocus: boolean
}

function Selector({ ranked, focus }: { ranked: Ranked[]; focus: Molecule | null }) {
  const compareIds = useWorkbench((s) => s.compareIds)
  const toggleCompare = useWorkbench((s) => s.toggleCompare)
  const focusName = usePresetName(focus?.properties.canonicalSmiles ?? null)
  const full = compareIds.length >= MAX_COMPARE

  return (
    <section className="surface">
      <SectionHead title="Select molecules to compare">
        <span className="hint">
          {compareIds.length} of {MAX_COMPARE} selected · the focus molecule is always shown
        </span>
      </SectionHead>
      <div className="picker">
        {focus && (
          <div className="picker__item picker__item--locked">
            <Depiction svg={focus.svg} size="xs" />
            <span className="picker__name">{focusName ?? 'Focus'}</span>
            <StatusBadge label="Focus" tone="accent" />
          </div>
        )}
        {ranked.map((entry) => {
          const on = compareIds.includes(entry.candidate.id)
          return (
            <button
              key={entry.candidate.id}
              className={'picker__item' + (on ? ' picker__item--on' : '')}
              onClick={() => toggleCompare(entry.candidate.id)}
              disabled={!on && full}
              title={!on && full ? `Remove one first — ${MAX_COMPARE} is the maximum` : undefined}
            >
              <Depiction svg={entry.candidate.svg} size="xs" />
              <span className="picker__name">
                Candidate {String(entry.rank).padStart(2, '0')}
              </span>
              <span className="picker__sub">{shortName(entry.candidate)}</span>
              {on && <StatusBadge label="Selected" tone="ok" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ComparisonTable({ columns, focus }: { columns: Column[]; focus: Molecule | null }) {
  const constraints = useWorkbench((s) => s.constraints)

  return (
    <div className="tablewrap">
      <table className="ctable">
        <thead>
          <tr>
            <th className="ctable__corner">Property</th>
            {columns.map((c) => (
              <th key={c.id}>
                <span className="ctable__colname">{c.name}</span>
                <span className="ctable__colsub">{c.sub}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((key) => {
            const measure = measureFor(key)
            return (
              <tr key={key}>
                <td className="ctable__name" title={measure?.about}>
                  {measure?.label ?? String(key)}
                </td>
                {columns.map((c) => {
                  const delta = deltaFor(
                    key,
                    c.properties,
                    focus?.properties ?? null,
                    constraints,
                  )
                  return (
                    <td key={c.id}>
                      <span className="ctable__val">{c.properties[key]}</span>
                      {!c.isFocus && <DeltaValue delta={delta} />}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          <tr>
            <td className="ctable__name">Rules</td>
            {columns.map((c) => (
              <td key={c.id}>
                <StatusBadge
                  label={`${c.rulesPassed}/${c.rulesTotal}`}
                  tone={c.rulesPassed === c.rulesTotal ? 'ok' : 'warn'}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Insights({ picked, focus }: { picked: Ranked[]; focus: Molecule | null }) {
  const items: { tone: 'ok' | 'warn' | 'info'; text: string }[] = []

  if (picked.length > 0) {
    const best = picked.reduce((a, b) => (b.scores.overall > a.scores.overall ? b : a))
    items.push({
      tone: 'ok',
      text: `Candidate ${String(best.rank).padStart(2, '0')} (${shortName(best.candidate)}) offers the best overall balance.`,
    })

    if (focus) {
      const soluble = picked.reduce((a, b) =>
        b.scores.solubilityGain > a.scores.solubilityGain ? b : a,
      )
      if (soluble.scores.solubilityGain > 0.1) {
        items.push({
          tone: soluble.candidate.properties.saScore > 6.5 ? 'warn' : 'ok',
          text:
            `Candidate ${String(soluble.rank).padStart(2, '0')} has the highest predicted solubility ` +
            `(+${soluble.scores.solubilityGain} log units)` +
            (soluble.candidate.properties.saScore > 6.5
              ? `, but at SA ${soluble.candidate.properties.saScore} it is harder to synthesize.`
              : '.'),
        })
      }
    }

    const threeD = picked.reduce((a, b) => (b.scores.threeD > a.scores.threeD ? b : a))
    if (!focus || threeD.scores.threeD > focus.properties.fsp3) {
      items.push({
        tone: 'info',
        text: `Candidate ${String(threeD.rank).padStart(2, '0')} provides the greatest 3D character (Fsp3 ${threeD.candidate.properties.fsp3}).`,
      })
    }

    const broke = picked.filter((p) => p.candidate.scaffoldOk === false)
    if (broke.length > 0) {
      items.push({
        tone: 'warn',
        text: `${broke.length} of these dropped the pinned group and cannot satisfy the brief as written.`,
      })
    }
  }

  if (items.length === 0) return null

  return (
    <section className="surface">
      <SectionHead title="Summary insights" />
      <ul className="insights">
        {items.map((i) => (
          <li key={i.text} className={'insights__item insights__item--' + i.tone}>
            <span className="insights__mark" aria-hidden="true">
              {i.tone === 'ok' ? '✓' : i.tone === 'warn' ? '⚠' : 'ℹ'}
            </span>
            {i.text}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ComparePage({ ranked }: { ranked: Ranked[] }) {
  const focus = useWorkbench((s) => s.focus)
  const compareIds = useWorkbench((s) => s.compareIds)
  const setPage = useWorkbench((s) => s.setPage)
  const focusName = usePresetName(focus?.properties.canonicalSmiles ?? null)

  const picked = useMemo(
    () =>
      compareIds
        .map((id) => ranked.find((r) => r.candidate.id === id))
        .filter((r): r is Ranked => r !== undefined),
    [compareIds, ranked],
  )

  const columns = useMemo<Column[]>(() => {
    const out: Column[] = []
    if (focus) {
      out.push({
        id: 'focus',
        name: focusName ?? 'Focus',
        sub: 'starting point',
        svg: focus.svg,
        properties: focus.properties,
        rulesPassed: focus.rules.rules.filter((r) => r.passes).length,
        rulesTotal: focus.rules.rules.length,
        isFocus: true,
      })
    }
    for (const entry of picked) {
      out.push({
        id: entry.candidate.id,
        name: `Candidate ${String(entry.rank).padStart(2, '0')}`,
        sub: shortName(entry.candidate),
        svg: entry.candidate.svg,
        properties: entry.candidate.properties,
        rulesPassed: entry.candidate.rules.rules.filter((r) => r.passes).length,
        rulesTotal: entry.candidate.rules.rules.length,
        isFocus: false,
      })
    }
    return out
  }, [focus, focusName, picked])

  const series = useMemo<RadarSeries[]>(
    () =>
      columns.map((c, i) => ({
        name: c.name,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        values: profileOf(c.properties, c.rulesPassed, c.rulesTotal),
      })),
    [columns],
  )

  return (
    <div className="page">
      <div className="pagehead">
        <h1>Compare molecules</h1>
        <p>Put candidates side by side and decide which one earns the next round.</p>
      </div>

      <Selector ranked={ranked} focus={focus} />

      {columns.length === 0 ? (
        <section className="surface">
          <EmptyState title="Nothing to compare yet." icon="⇄">
            <p>
              Load a focus molecule and pick candidates above, or use the ⇄ button on any card on
              the{' '}
              <button className="linkbtn" onClick={() => setPage('design')}>
                Design page
              </button>
              .
            </p>
          </EmptyState>
        </section>
      ) : (
        <div className="comparelayout">
          <section className="surface">
            <SectionHead title="Property comparison" />
            <ComparisonTable columns={columns} focus={focus} />
          </section>

          <section className="surface">
            <SectionHead title="Profile radar" />
            <RadarChart axes={AXES} series={series} />
            <ul className="legendkeys">
              {series.map((s) => (
                <li key={s.name}>
                  <i style={{ background: s.color }} />
                  {s.name}
                </li>
              ))}
            </ul>
            <p className="hint">
              Each axis is scaled to a sensible working range, not to the board, so the shapes
              stay comparable between sessions.
            </p>
          </section>
        </div>
      )}

      {picked.length > 0 && <Insights picked={picked} focus={focus} />}
    </div>
  )
}

/** Kept for the Compare tray, which needs the same shape as a candidate row. */
export type { Candidate }
