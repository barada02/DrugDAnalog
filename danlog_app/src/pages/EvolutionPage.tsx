import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { FOCUS_INSPECT_ID, buildMolecule, useWorkbench } from '../store/workbench'
import type { Candidate, Molecule } from '../store/workbench'
import type { Properties } from '../chem/properties'
import { measureFor } from '../chem/measures'
import { download } from '../chem/export'
import { deltaFor, generationMap, rankLabel, type Ranked } from '../chem/ranking'
import { EmptyState, Metric, SectionHead, StatusBadge } from '../ui/primitives'
import { DeltaValue, Depiction } from '../ui/molecule'
import { LineChart, SERIES_COLORS, Sparkline, type LineSeries } from '../ui/charts'
import { shortName } from '../ui/CandidateCard'
import { buildGraph, type GraphNode } from '../ui/graph-tree'

/**
 * React Flow and its stylesheet are ~58 KB gzipped and are used on this page
 * alone, so they load when the page does rather than on first paint.
 */
const GenerationGraph = lazy(() =>
  import('../ui/GenerationGraph').then((m) => ({ default: m.GenerationGraph })),
)
import { usePresetName } from '../ui/usePresetName'

/**
 * The Evolution page: how we got here, without inventing a story.
 *
 * The previous version drew focus -> C01 -> C02 -> C03 with arrows between
 * them whenever nothing had been promoted. Those candidates are siblings off
 * one parent, not a chain, so the arrows asserted a history that never
 * happened. Design is a tree, so this draws a tree: a real node-link graph,
 * laid out by d3-hierarchy, with an edge from every molecule to the ones
 * actually designed from it.
 */

const TREND_ROWS: (keyof Properties)[] = [
  'logS',
  'logP',
  'tpsa',
  'mw',
  'saScore',
  'hiaScore',
  'bbaCrossing',
]

// --- shaping the board into generations --------------------------------------

type SiblingGroup = {
  parentId: string | null
  parentLabel: string
  members: Candidate[]
}

type Generation = { depth: number; groups: SiblingGroup[] }

/**
 * Groups the board into columns. Depth comes from the shared generationMap so
 * the "G2" tag on a card and the column a molecule sits in here are computed
 * once, from the same code, and cannot drift apart.
 */
function buildGenerations(
  candidates: Candidate[],
  labelFor: (c: Candidate) => string,
): Generation[] {
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const depth = generationMap(candidates)

  if (candidates.length === 0) return []

  const maxDepth = Math.max(...candidates.map((c) => depth.get(c.id) ?? 1))
  const generations: Generation[] = []

  for (let d = 1; d <= maxDepth; d++) {
    const members = candidates.filter((c) => depth.get(c.id) === d)
    if (members.length === 0) continue
    const grouped = new Map<string, Candidate[]>()
    for (const c of members) {
      const key = c.parentId ?? ''
      grouped.set(key, [...(grouped.get(key) ?? []), c])
    }
    generations.push({
      depth: d,
      groups: [...grouped.entries()].map(([key, ms]) => {
        const parent = key ? byId.get(key) : undefined
        return {
          parentId: key || null,
          parentLabel: parent ? labelFor(parent) : 'the starting molecule',
          members: [...ms].sort((a, b) => a.createdAt - b.createdAt),
        }
      }),
    })
  }

  return generations
}

/** The chain of promotions that produced the current focus, oldest first. */
function ancestry(candidates: Candidate[], focusId: string | null): Candidate[] {
  const chain: Candidate[] = []
  const seen = new Set<string>()
  let id = focusId
  while (id && !seen.has(id)) {
    seen.add(id)
    const found = candidates.find((c) => c.id === id)
    if (!found) break
    chain.unshift(found)
    id = found.parentId
  }
  return chain
}

// --- the tree ----------------------------------------------------------------

function EvoNode({
  candidate,
  label,
  promoted,
  isFocus,
  starred,
  focus,
}: {
  candidate: Candidate
  label: string
  promoted: boolean
  isFocus: boolean
  starred: boolean
  focus: Molecule | null
}) {
  const inspect = useWorkbench((s) => s.inspect)
  const constraints = useWorkbench((s) => s.constraints)
  const rejected = candidate.status === 'rejected'
  const delta = deltaFor('logS', candidate.properties, focus?.properties ?? null, constraints)

  /**
   * One state per node, in precedence order, so a card carries a single
   * meaning rather than three overlapping tints. The colour is the status --
   * that is the whole point of colouring it.
   */
  const state = isFocus
    ? 'focus'
    : rejected
      ? 'rejected'
      : promoted
        ? 'promoted'
        : candidate.status === 'accepted'
          ? 'accepted'
          : 'pending'

  return (
    <button
      className={'evonode evonode--' + state}
      onClick={() => inspect(candidate.id)}
      title={candidate.rationale || undefined}
    >
      <span className="evonode__top">
        <span className="evonode__rank">{label}</span>
        {isFocus ? (
          <span className="evonode__mark evonode__mark--focus">● focus</span>
        ) : promoted ? (
          <span className="evonode__mark evonode__mark--promoted">✓ promoted</span>
        ) : rejected ? (
          <span className="evonode__mark evonode__mark--rejected">✗ rejected</span>
        ) : starred ? (
          <span className="evonode__mark">★</span>
        ) : null}
      </span>
      <Depiction svg={candidate.svg} size="xs" faded={rejected} />
      <span className="evonode__name">{shortName(candidate)}</span>
      <span className="evonode__stat">
        logS {candidate.properties.logS} <DeltaValue delta={delta} />
      </span>
      {candidate.constraints.total > 0 && (
        <span
          className={
            'evonode__goals' + (candidate.constraints.allMet ? ' evonode__goals--met' : '')
          }
        >
          {candidate.constraints.satisfied}/{candidate.constraints.total} goals
        </span>
      )}
    </button>
  )
}

function GenerationTree({
  candidates,
  rankOf,
  promotedIds,
  focus,
  focusId,
  origin,
  originSmiles,
  originIsFocus,
}: {
  candidates: Candidate[]
  rankOf: (c: Candidate) => string
  promotedIds: Set<string>
  focus: Molecule | null
  focusId: string | null
  /** Fully worked out, whether or not it is still the focus. Null while it builds. */
  origin: Molecule | null
  originSmiles: string | null
  originIsFocus: boolean
}) {
  const inspect = useWorkbench((s) => s.inspect)
  const shortlist = useWorkbench((s) => s.shortlist)

  const root = useMemo(() => buildGraph(candidates), [candidates])

  /**
   * Memoised because the graph lays out from it. An inline arrow here would
   * rebuild every card on every render, remounting the molecule drawings and
   * throwing away the layout each time.
   */
  const renderNode = useCallback(
    (node: GraphNode) => {
      if (!node.candidate) {
        // The origin is rebuilt from its SMILES when it is no longer the
        // focus, so it shows a structure and real numbers like every other
        // node rather than an apology for missing data.
        if (!origin) {
          return (
            <div className="evonode evonode--origin evonode--ghost">
              <span className="evonode__top">
                <span className="evonode__rank">Start</span>
              </span>
              <code className="smiles">{originSmiles ?? 'starting molecule'}</code>
              <span className="evonode__stat evonode__stat--muted">Working it out…</span>
            </div>
          )
        }

        const body = (
          <>
            <span className="evonode__top">
              <span className="evonode__rank">Start</span>
              {originIsFocus && (
                <span className="evonode__mark evonode__mark--focus">● focus</span>
              )}
            </span>
            <Depiction svg={origin.svg} size="xs" />
            <span className="evonode__name">Starting molecule</span>
            <span className="evonode__stat">logS {origin.properties.logS}</span>
            {origin.constraints.total > 0 && (
              <span
                className={
                  'evonode__goals' + (origin.constraints.allMet ? ' evonode__goals--met' : '')
                }
              >
                {origin.constraints.satisfied}/{origin.constraints.total} goals
              </span>
            )}
          </>
        )

        // Only the focus molecule has somewhere to open; a superseded origin
        // is shown but not clickable, rather than clicking into nothing.
        return originIsFocus ? (
          <button
            className="evonode evonode--origin evonode--focus"
            onClick={() => inspect(FOCUS_INSPECT_ID)}
          >
            {body}
          </button>
        ) : (
          <div className="evonode evonode--origin evonode--static">{body}</div>
        )
      }

      const c = node.candidate
      return (
        <EvoNode
          candidate={c}
          label={rankOf(c)}
          promoted={promotedIds.has(c.id)}
          isFocus={focusId === c.id}
          starred={shortlist.includes(c.id)}
          focus={focus}
        />
      )
    },
    [origin, originSmiles, originIsFocus, inspect, rankOf, promotedIds, focusId, shortlist, focus],
  )

  return (
    <Suspense
      fallback={
        <div className="splash splash--inline">
          <div className="spinner" />
          <p>Laying out the design tree…</p>
        </div>
      }
    >
      <GenerationGraph root={root} promotedIds={promotedIds} renderNode={renderNode} />
    </Suspense>
  )
}

// --- convergence -------------------------------------------------------------

type TrendNode = {
  id: string
  label: string
  name: string
  properties: Properties
}

function ConvergenceChart({
  generations,
  promotedIds,
  origin,
}: {
  generations: Generation[]
  promotedIds: Set<string>
  /**
   * The molecule the board started from, rebuilt from its SMILES when it is no
   * longer the focus. Plotting the *current* focus at the "Start" position
   * would put today's result at the origin, so this is deliberately not that.
   */
  origin: Molecule | null
}) {
  const constraints = useWorkbench((s) => s.constraints)
  const usingGoals = constraints.length > 0

  /**
   * How close a molecule is to the brief. Falls back to rulesets when no target
   * profile has been set, because a constraint ratio over zero constraints is
   * not 100% -- it is undefined, and drawing it as success would be a lie.
   */
  const ratio = (m: {
    constraints: Candidate['constraints']
    rules: Candidate['rules']
  }): number | null => {
    if (usingGoals) {
      return m.constraints.total === 0 ? null : m.constraints.satisfied / m.constraints.total
    }
    return m.rules.rules.length === 0
      ? null
      : m.rules.rules.filter((r) => r.passes).length / m.rules.rules.length
  }

  const labels = ['Start', ...generations.map((g) => `Gen ${g.depth}`)]
  const startValue = origin ? ratio(origin) : null

  const best: (number | null)[] = [
    startValue,
    ...generations.map((g) => {
      const alive = g.groups
        .flatMap((s) => s.members)
        .filter((c) => c.status !== 'rejected')
        .map(ratio)
        .filter((r): r is number => r !== null)
      return alive.length ? Math.max(...alive) : null
    }),
  ]

  const promoted: (number | null)[] = [
    startValue,
    ...generations.map((g) => {
      const hit = g.groups.flatMap((s) => s.members).find((c) => promotedIds.has(c.id))
      return hit ? ratio(hit) : null
    }),
  ]

  const series: LineSeries[] = [
    { name: 'Best in generation', color: SERIES_COLORS[0], points: best },
  ]
  if (promoted.some((p, i) => p !== null && i > 0)) {
    series.push({
      name: 'Promoted',
      color: SERIES_COLORS[1],
      points: promoted,
      dashed: true,
    })
  }

  return (
    <section className="surface">
      <SectionHead title={usingGoals ? 'Target profile met' : 'Rulesets passed'} />
      <LineChart labels={labels} series={series} />
      <ul className="legendkeys">
        {series.map((s) => (
          <li key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
      <p className="hint">
        {usingGoals
          ? 'The share of your target profile each generation satisfied. Rising means the design is converging on the brief.'
          : 'No target profile is set, so this tracks the four drug-likeness rulesets instead. Set a target profile on the Design page to measure against what you actually want.'}
      </p>
    </section>
  )
}

// --- property trends ---------------------------------------------------------

function PropertyTrends({ nodes }: { nodes: TrendNode[] }) {
  const constraints = useWorkbench((s) => s.constraints)
  const start = nodes[0]
  const end = nodes[nodes.length - 1]

  return (
    <div className="tablewrap">
      <table className="ctable">
        <thead>
          <tr>
            <th className="ctable__corner">Property</th>
            <th className="ctable__corner">Trend</th>
            {nodes.map((n) => (
              <th key={n.id}>
                <span className="ctable__colname">{n.label}</span>
                <span className="ctable__colsub">{n.name}</span>
              </th>
            ))}
            <th className="ctable__corner">Net</th>
          </tr>
        </thead>
        <tbody>
          {TREND_ROWS.map((key) => {
            const measure = measureFor(key)
            const values = nodes.map((n) => Number(n.properties[key]))
            const net = deltaFor(key, end.properties, start.properties, constraints)
            return (
              <tr key={key}>
                <td className="ctable__name" title={measure?.about}>
                  {measure?.label ?? String(key)}
                </td>
                <td>
                  <Sparkline values={values} />
                </td>
                {nodes.map((n, i) => {
                  // Every cell is coloured against the starting molecule, so a
                  // column reads as "where we had got to", not "what changed
                  // since the step before".
                  const d = deltaFor(key, n.properties, start.properties, constraints)
                  const tone =
                    i === 0 || d.direction === 'flat' || d.good === null
                      ? ''
                      : d.good
                        ? ' ctable__cell--good'
                        : ' ctable__cell--bad'
                  return (
                    <td key={n.id} className={'ctable__cell' + tone}>
                      <span className="ctable__val">{n.properties[key]}</span>
                    </td>
                  )
                })}
                <td>
                  <DeltaValue delta={net} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** What actually changed, in a sentence, from numbers we already have. */
function ChangeSummary({ nodes, scaffoldLabel }: { nodes: TrendNode[]; scaffoldLabel: string | null }) {
  if (nodes.length < 2) return null
  const start = nodes[0].properties
  const end = nodes[nodes.length - 1].properties
  const steps = nodes.length - 1

  const move = (a: number, b: number) => Number((b - a).toFixed(2))
  const logS = move(start.logS, end.logS)
  const sa = move(start.saScore, end.saScore)
  const hia = move(start.hiaScore, end.hiaScore)

  const phrase = (n: number, unit = '') =>
    n === 0 ? 'unchanged' : `${n > 0 ? '+' : ''}${n}${unit}`

  return (
    <p className="summaryline">
      Across {steps} step{steps === 1 ? '' : 's'}: solubility {phrase(logS)} log units, synthetic
      accessibility {phrase(sa)} ({sa > 0 ? 'harder' : sa < 0 ? 'easier' : 'no change'}), predicted
      absorption {phrase(hia, '%')}.
      {scaffoldLabel && ` The ${scaffoldLabel} was pinned throughout.`}
    </p>
  )
}

// --- current focus -----------------------------------------------------------

function CurrentFocusPanel({
  focus,
  nodes,
  focusCandidate,
}: {
  focus: Molecule
  nodes: TrendNode[]
  focusCandidate: Candidate | null
}) {
  const name = usePresetName(focus.properties.canonicalSmiles)
  const goal = useWorkbench((s) => s.goal)
  const candidates = useWorkbench((s) => s.candidates)
  const setPage = useWorkbench((s) => s.setPage)
  const setCompareIds = useWorkbench((s) => s.setCompareIds)
  const inspect = useWorkbench((s) => s.inspect)
  const reset = useWorkbench((s) => s.reset)
  const note = useWorkbench((s) => s.note)
  const p = focus.properties

  const compareWithStart = () => {
    const first = nodes.find((n) => n.id !== 'origin' && n.id !== 'focus')
    setCompareIds(first ? [first.id] : [])
    setPage('compare')
  }

  const exportReport = () => {
    const header = ['step', 'name', 'smiles', ...TREND_ROWS].join(',')
    const rows = nodes.map((n) =>
      [n.label, n.name, n.properties.canonicalSmiles, ...TREND_ROWS.map((k) => n.properties[k])]
        .map((v) => {
          const text = String(v ?? '')
          return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
        })
        .join(','),
    )
    download('analog-evolution.csv', [header, ...rows].join('\n'), 'text/csv')
    note({ actor: 'human', tool: 'export_evolution', detail: `${nodes.length} steps`, ok: true })
  }

  const startFresh = () => {
    const n = candidates.length
    const smiles = p.canonicalSmiles
    const ok = confirm(
      'Start a new series from this molecule?\n\n' +
        `This permanently clears ${n} candidate${n === 1 ? '' : 's'}, the design history and ` +
        'the saved session. This molecule stays as the focus.\n\n' +
        'Export the evolution report first if you want to keep it.',
    )
    if (!ok) return
    reset()
    void useWorkbench.getState().setFocus(smiles)
    note({ actor: 'human', tool: 'set_focus_molecule', detail: `new series from ${smiles}`, ok: true })
  }

  return (
    <aside className="surface focuspanel">
      <SectionHead title="Current focus" />
      <button className="focus__figurebtn" onClick={() => inspect(FOCUS_INSPECT_ID)}>
        <Depiction svg={focus.svg} size="md" />
      </button>
      <h3 className="focuspanel__name">
        {name ?? (focusCandidate ? shortName(focusCandidate) : 'Custom molecule')}
      </h3>
      <code className="smiles">{p.canonicalSmiles}</code>

      <div className="metrics">
        <Metric label="logS" value={p.logS} />
        <Metric label="LogP" value={p.logP} />
        <Metric label="SA" value={p.saScore} />
        <Metric label="HIA" value={p.hiaScore} unit="%" />
      </div>
      <button className="linkbtn" onClick={() => inspect(FOCUS_INSPECT_ID)}>
        Inspect all properties →
      </button>

      <section className="focuspanel__block">
        <h4>Design rationale</h4>
        <p className="hint">
          {focusCandidate?.rationale || goal || 'No rationale recorded for this molecule yet.'}
        </p>
      </section>

      <section className="focuspanel__block">
        <h4>Evolution actions</h4>
        <div className="stackedlinks">
          <button className="linkbtn" onClick={compareWithStart}>
            → Compare current with start
          </button>
          <button className="linkbtn" onClick={() => setPage('design')}>
            → Back to the design board
          </button>
          <button className="linkbtn" onClick={exportReport}>
            → Export evolution report
          </button>
        </div>
        <button className="btn btn--danger focuspanel__reset" onClick={startFresh}>
          Set as new starting point
        </button>
        <p className="hint">Clears the board and begins a fresh series from this molecule.</p>
      </section>
    </aside>
  )
}

// --- page --------------------------------------------------------------------

export function EvolutionPage({ ranked }: { ranked: Ranked[] }) {
  const focus = useWorkbench((s) => s.focus)
  const focusId = useWorkbench((s) => s.focusId)
  const candidates = useWorkbench((s) => s.candidates)
  const scaffold = useWorkbench((s) => s.scaffold)
  const constraints = useWorkbench((s) => s.constraints)
  const setPage = useWorkbench((s) => s.setPage)
  const focusName = usePresetName(focus?.properties.canonicalSmiles ?? null)

  const rankMap = useMemo(
    () => new Map(ranked.map((r) => [r.candidate.id, r])),
    [ranked],
  )
  const rankOf = useCallback(
    (c: Candidate) => {
      const hit = rankMap.get(c.id)
      return hit ? `Candidate ${rankLabel(hit.rank)}` : 'Candidate'
    },
    [rankMap],
  )

  // The labeller is inlined rather than passed in, so the memo depends on the
  // map it actually reads instead of on a function identity.
  const generations = useMemo(
    () =>
      buildGenerations(candidates, (c) => {
        const hit = rankMap.get(c.id)
        return hit ? `Candidate ${rankLabel(hit.rank)}` : 'Candidate'
      }),
    [candidates, rankMap],
  )

  const promotedChain = useMemo(() => ancestry(candidates, focusId), [candidates, focusId])
  const promotedIds = useMemo(
    () => new Set(promotedChain.map((c) => c.id)),
    [promotedChain],
  )
  const hasPromotions = promotedChain.length > 0

  /** The molecule the earliest candidates were actually designed from. */
  const rootParentSmiles = useMemo(
    () => candidates.find((c) => c.parentId === null)?.parentSmiles ?? null,
    [candidates],
  )

  /**
   * Is the molecule in focus still the one this board grew from?
   *
   * False after any promotion, and false too when a different molecule was
   * loaded part-way through a session -- focusId is null in that case as well,
   * but the tree's origin is not what is on screen, so testing focusId alone
   * would label a stranger as the starting point.
   */
  const originIsFocus =
    focusId === null &&
    (rootParentSmiles === null || rootParentSmiles === focus?.properties.canonicalSmiles)

  const originSmiles = rootParentSmiles ?? focus?.properties.canonicalSmiles ?? null

  /**
   * The starting molecule, worked out in full.
   *
   * The board keeps only its SMILES once it stops being the focus, which is
   * why it used to render as "properties not retained". Everything else about
   * it is reproducible -- RDKit is deterministic -- so it is rebuilt rather
   * than apologised for. Held with its SMILES so a slow rebuild cannot be
   * attributed to a different starting molecule.
   */
  const [built, setBuilt] = useState<{ smiles: string; molecule: Molecule } | null>(null)

  useEffect(() => {
    if (!originSmiles || originIsFocus) return
    let cancelled = false
    buildMolecule(originSmiles, scaffold, constraints)
      .then((molecule) => {
        if (!cancelled) setBuilt({ smiles: originSmiles, molecule })
      })
      .catch(() => {
        // A SMILES that no longer parses leaves the placeholder in place.
      })
    return () => {
      cancelled = true
    }
  }, [originSmiles, originIsFocus, scaffold, constraints])

  const origin: Molecule | null = originIsFocus
    ? focus
    : built?.smiles === originSmiles
      ? built.molecule
      : null

  const originName = usePresetName(originSmiles)

  /**
   * The columns of the property table.
   *
   * When promotions exist this is the path actually taken. When they do not,
   * there is no path -- so it shows the best candidate of each generation and
   * says so, rather than stringing siblings together as though one led to the
   * next.
   */
  const nodes = useMemo<TrendNode[]>(() => {
    if (!focus) return []

    if (hasPromotions) {
      const steps = promotedChain.map((c, i) => ({
        id: c.id,
        label: i === promotedChain.length - 1 ? 'Current' : `Step ${i + 1}`,
        name: rankMap.get(c.id) ? `Candidate ${rankLabel(rankMap.get(c.id)!.rank)}` : shortName(c),
        properties: c.properties,
      }))
      // With the origin rebuilt, the path can be measured from where it
      // actually began rather than from its first promotion.
      return origin
        ? [
            {
              id: 'origin',
              label: 'Start',
              name: originName ?? 'Starting molecule',
              properties: origin.properties,
            },
            ...steps,
          ]
        : steps
    }

    const bestPerGen = generations
      .map((g) => {
        const alive = g.groups.flatMap((s) => s.members).filter((c) => c.status !== 'rejected')
        if (alive.length === 0) return null
        return alive.reduce((a, b) =>
          (rankMap.get(b.id)?.scores.overall ?? 0) > (rankMap.get(a.id)?.scores.overall ?? 0)
            ? b
            : a,
        )
      })
      .filter((c): c is Candidate => c !== null)

    return [
      {
        id: 'focus',
        label: 'Start',
        name: focusName ?? 'Focus molecule',
        properties: focus.properties,
      },
      ...bestPerGen.map((c, i) => ({
        id: c.id,
        label: `Gen ${i + 1} best`,
        name: rankMap.get(c.id) ? `Candidate ${rankLabel(rankMap.get(c.id)!.rank)}` : shortName(c),
        properties: c.properties,
      })),
    ]
  }, [focus, focusName, originName, origin, hasPromotions, promotedChain, generations, rankMap])

  const focusCandidate = focusId ? (candidates.find((c) => c.id === focusId) ?? null) : null

  if (!focus) {
    return (
      <div className="page">
        <section className="surface">
          <EmptyState title="No molecule in focus." icon="⌘">
            <p>
              Load a starting molecule on the{' '}
              <button className="linkbtn" onClick={() => setPage('design')}>
                Design page
              </button>{' '}
              and the history builds itself from there.
            </p>
          </EmptyState>
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="pagehead">
        <h1>Molecule evolution</h1>
        <p>
          Every proposal this board has produced, grouped by the molecule it was actually designed
          from. Promotions form the spine; siblings and dead ends stay visible.
        </p>
      </div>

      <section className="surface">
        <SectionHead title="Generations" count={
          candidates.length > 0 ? (
            <StatusBadge
              label={`${generations.length} generation${generations.length === 1 ? '' : 's'}`}
              tone="neutral"
            />
          ) : null
        } />
        {candidates.length === 0 ? (
          <EmptyState title="Nothing designed yet." icon="⌬">
            <p>
              Ask your agent for analogs on the{' '}
              <button className="linkbtn" onClick={() => setPage('design')}>
                Design page
              </button>{' '}
              and the tree grows from your starting molecule.
            </p>
          </EmptyState>
        ) : (
          <GenerationTree
            candidates={candidates}
            rankOf={rankOf}
            promotedIds={promotedIds}
            focus={focus}
            focusId={focusId}
            origin={origin}
            originSmiles={originSmiles}
            originIsFocus={originIsFocus}
          />
        )}
      </section>

      {candidates.length > 0 && (
        <div className="evolutionlayout">
          <div className="evolutioncol">
            <ConvergenceChart
              generations={generations}
              promotedIds={promotedIds}
              origin={origin}
            />

            <section className="surface">
              <SectionHead title="Property evolution">
                <StatusBadge
                  label={hasPromotions ? 'Promoted path' : 'Best per generation'}
                  tone={hasPromotions ? 'accent' : 'neutral'}
                />
              </SectionHead>
              {!hasPromotions && (
                <p className="hint">
                  Nothing has been promoted, so there is no path to follow. These are the
                  strongest candidate of each generation, which is a summary of the board rather
                  than a history of it.
                </p>
              )}
              {nodes.length < 2 ? (
                <p className="hint">
                  One molecule so far. Trends appear once there is a second to compare against.
                </p>
              ) : (
                <>
                  <ChangeSummary nodes={nodes} scaffoldLabel={scaffold?.label ?? null} />
                  <PropertyTrends nodes={nodes} />
                </>
              )}
            </section>
          </div>

          <CurrentFocusPanel focus={focus} nodes={nodes} focusCandidate={focusCandidate} />
        </div>
      )}
    </div>
  )
}
