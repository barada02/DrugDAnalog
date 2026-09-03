import { useMemo } from 'react'
import { FOCUS_INSPECT_ID, useWorkbench } from '../store/workbench'
import type { Candidate, Molecule } from '../store/workbench'
import type { Properties } from '../chem/properties'
import { measureFor } from '../chem/measures'
import { download } from '../chem/export'
import { deltaFor, rankLabel, type Ranked } from '../chem/ranking'
import { EmptyState, Metric, SectionHead, StatusBadge } from '../ui/primitives'
import { DeltaValue, Depiction } from '../ui/molecule'
import { LineChart, SERIES_COLORS, Sparkline, type LineSeries } from '../ui/charts'
import { shortName } from '../ui/CandidateCard'
import { usePresetName } from '../ui/usePresetName'

/**
 * The Evolution page: how we got here, without inventing a story.
 *
 * The previous version drew focus -> C01 -> C02 -> C03 with arrows between
 * them whenever nothing had been promoted. Those candidates are siblings off
 * one parent, not a chain, so the arrows asserted a history that never
 * happened. Design is a tree, so this draws a tree: one column per
 * generation, siblings grouped under the parent they actually came from.
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
 * Depth 1 is everything designed straight off the molecule that started the
 * board; each promotion adds a level. Written iteratively against a memo so a
 * malformed parent chain cannot recurse forever.
 */
function buildGenerations(
  candidates: Candidate[],
  labelFor: (c: Candidate) => string,
): Generation[] {
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const depth = new Map<string, number>()

  const depthOf = (c: Candidate): number => {
    const known = depth.get(c.id)
    if (known !== undefined) return known
    // Provisional value doubles as the cycle guard.
    depth.set(c.id, 1)
    const parent = c.parentId ? byId.get(c.parentId) : undefined
    const resolved = parent ? depthOf(parent) + 1 : 1
    depth.set(c.id, resolved)
    return resolved
  }

  candidates.forEach(depthOf)
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

  return (
    <button
      className={
        'evonode' +
        (promoted ? ' evonode--promoted' : '') +
        (isFocus ? ' evonode--focus' : '') +
        (rejected ? ' evonode--rejected' : '')
      }
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
  generations,
  rankOf,
  promotedIds,
  focus,
  focusId,
  originSmiles,
  originIsFocus,
}: {
  generations: Generation[]
  rankOf: (c: Candidate) => string
  promotedIds: Set<string>
  focus: Molecule | null
  focusId: string | null
  originSmiles: string | null
  originIsFocus: boolean
}) {
  const inspect = useWorkbench((s) => s.inspect)
  const shortlist = useWorkbench((s) => s.shortlist)

  return (
    <div className="gentree">
      <section className="gen">
        <header className="gen__head">
          <strong>Origin</strong>
        </header>
        <div className="gen__groups">
          <div className="sibgroup">
            <div className="sibgroup__nodes">
              {originIsFocus && focus ? (
                <button
                  className="evonode evonode--origin evonode--focus"
                  onClick={() => inspect(FOCUS_INSPECT_ID)}
                >
                  <span className="evonode__top">
                    <span className="evonode__rank">Start</span>
                    <span className="evonode__mark evonode__mark--focus">● focus</span>
                  </span>
                  <Depiction svg={focus.svg} size="xs" />
                  <span className="evonode__name">Starting molecule</span>
                  <span className="evonode__stat">logS {focus.properties.logS}</span>
                </button>
              ) : (
                // Once something has been promoted the original molecule is no
                // longer in focus, and the board keeps only its SMILES -- so we
                // show that rather than re-deriving a structure we never stored.
                <div className="evonode evonode--origin evonode--ghost">
                  <span className="evonode__top">
                    <span className="evonode__rank">Start</span>
                  </span>
                  <code className="smiles">{originSmiles ?? 'starting molecule'}</code>
                  <span className="evonode__stat evonode__stat--muted">
                    Properties not retained
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {generations.map((gen) => {
        const count = gen.groups.reduce((n, g) => n + g.members.length, 0)
        return (
          <section className="gen" key={gen.depth}>
            <header className="gen__head">
              <strong>Generation {gen.depth}</strong>
              <span>
                {count} candidate{count === 1 ? '' : 's'}
              </span>
            </header>
            <div className="gen__groups">
              {gen.groups.map((group) => (
                <div className="sibgroup" key={group.parentId ?? 'root'}>
                  <span className="sibgroup__from">from {group.parentLabel}</span>
                  <div className="sibgroup__nodes">
                    {group.members.map((c) => (
                      <EvoNode
                        key={c.id}
                        candidate={c}
                        label={rankOf(c)}
                        promoted={promotedIds.has(c.id)}
                        isFocus={focusId === c.id}
                        starred={shortlist.includes(c.id)}
                        focus={focus}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
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
  focus,
  originIsFocus,
}: {
  generations: Generation[]
  promotedIds: Set<string>
  focus: Molecule | null
  /**
   * Whether the molecule in focus is still the one the board started from.
   * Once something has been promoted it is not, and plotting the current
   * molecule at the "Start" position would place today's result at the origin.
   */
  originIsFocus: boolean
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
  // Null rather than the current molecule's value: the origin's properties are
  // not retained once it stops being the focus, and a gap is honest where a
  // borrowed number is not.
  const startValue = originIsFocus && focus ? ratio(focus) : null

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
  const setPage = useWorkbench((s) => s.setPage)
  const focusName = usePresetName(focus?.properties.canonicalSmiles ?? null)

  const rankMap = useMemo(
    () => new Map(ranked.map((r) => [r.candidate.id, r])),
    [ranked],
  )
  const rankOf = (c: Candidate) => {
    const hit = rankMap.get(c.id)
    return hit ? `Candidate ${rankLabel(hit.rank)}` : 'Candidate'
  }

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
      return promotedChain.map((c, i) => ({
        id: c.id,
        label: i === promotedChain.length - 1 ? 'Current' : `Step ${i + 1}`,
        name: rankMap.get(c.id) ? `Candidate ${rankLabel(rankMap.get(c.id)!.rank)}` : shortName(c),
        properties: c.properties,
      }))
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
  }, [focus, focusName, hasPromotions, promotedChain, generations, rankMap])

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
            generations={generations}
            rankOf={rankOf}
            promotedIds={promotedIds}
            focus={focus}
            focusId={focusId}
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
              focus={focus}
              originIsFocus={originIsFocus}
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
