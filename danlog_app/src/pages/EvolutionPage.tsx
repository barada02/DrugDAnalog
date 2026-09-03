import { useMemo } from 'react'
import { FOCUS_INSPECT_ID, useWorkbench } from '../store/workbench'
import type { Candidate, Molecule } from '../store/workbench'
import type { Properties } from '../chem/properties'
import { measureFor } from '../chem/measures'
import { download } from '../chem/export'
import { rankLabel, type Ranked } from '../chem/ranking'
import { EmptyState, Metric, SectionHead, StatusBadge } from '../ui/primitives'
import { Depiction } from '../ui/molecule'
import { Sparkline } from '../ui/charts'
import { shortName } from '../ui/CandidateCard'
import { usePresetName } from '../ui/usePresetName'

/**
 * The Evolution page: how we got here.
 *
 * Two different stories can be told from this data and conflating them would
 * be a lie, so the page picks explicitly. If molecules have actually been
 * promoted, it walks the real lineage. If nothing has been promoted yet, it
 * shows the exploration around a single focus and says so.
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

type Node = {
  id: string
  label: string
  name: string
  svg: string
  properties: Properties
  status: string
  tone: 'ok' | 'warn' | 'bad' | 'accent' | 'neutral'
  candidateId: string | null
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

function TimelineNode({ node, onClick }: { node: Node; onClick?: () => void }) {
  const inner = (
    <>
      <span className="tnode__step">{node.label}</span>
      <Depiction svg={node.svg} size="xs" />
      <span className="tnode__name">{node.name}</span>
      <StatusBadge label={node.status} tone={node.tone} />
    </>
  )
  return onClick ? (
    <button className="tnode" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="tnode">{inner}</div>
  )
}

function PropertyTrends({ nodes }: { nodes: Node[] }) {
  return (
    <div className="tablewrap">
      <table className="ctable">
        <thead>
          <tr>
            <th className="ctable__corner">Property</th>
            {nodes.map((n) => (
              <th key={n.id}>
                <span className="ctable__colname">{n.label}</span>
                <span className="ctable__colsub">{n.name}</span>
              </th>
            ))}
            <th className="ctable__corner">Trend</th>
          </tr>
        </thead>
        <tbody>
          {TREND_ROWS.map((key) => {
            const measure = measureFor(key)
            const values = nodes.map((n) => Number(n.properties[key]))
            return (
              <tr key={key}>
                <td className="ctable__name" title={measure?.about}>
                  {measure?.label ?? String(key)}
                </td>
                {values.map((v, i) => (
                  <td key={nodes[i].id}>
                    <span className="ctable__val">{v}</span>
                  </td>
                ))}
                <td>
                  <Sparkline values={values} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CurrentFocusPanel({
  focus,
  nodes,
  focusCandidate,
}: {
  focus: Molecule
  nodes: Node[]
  focusCandidate: Candidate | null
}) {
  const name = usePresetName(focus.properties.canonicalSmiles)
  const goal = useWorkbench((s) => s.goal)
  const setPage = useWorkbench((s) => s.setPage)
  const setCompareIds = useWorkbench((s) => s.setCompareIds)
  const note = useWorkbench((s) => s.note)
  const p = focus.properties

  const compareWithStart = () => {
    // The start node carries the focus sentinel rather than a candidate id, and
    // the Compare tray only understands real candidates.
    const first = nodes.find((n) => n.candidateId && n.candidateId !== FOCUS_INSPECT_ID)
    setCompareIds(first?.candidateId ? [first.candidateId] : [])
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

  return (
    <aside className="surface focuspanel">
      <SectionHead title="Current focus" />
      <Depiction svg={focus.svg} size="md" />
      <h3 className="focuspanel__name">
        {name ?? (focusCandidate ? shortName(focusCandidate) : 'Custom molecule')}
      </h3>
      <code className="smiles">{p.canonicalSmiles}</code>

      <div className="metrics">
        <Metric label="MW" value={p.mw} />
        <Metric label="LogP" value={p.logP} />
        <Metric label="TPSA" value={p.tpsa} />
        <Metric label="logS" value={p.logS} />
        <Metric label="SA" value={p.saScore} />
        <Metric label="HIA" value={p.hiaScore} unit="%" />
      </div>

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
      </section>
    </aside>
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
  const inspect = useWorkbench((s) => s.inspect)

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
        <button className="tree__link" onClick={() => inspect(candidate.id)}>
          <code>{candidate.properties.canonicalSmiles}</code>
        </button>
        <span className="tree__meta">
          logP {candidate.properties.logP} &middot; logS {candidate.properties.logS}
        </span>
      </li>,
      ...render(candidate.id, depth + 1),
    ])

  return (
    <section className="surface">
      <SectionHead title="Design path" />
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

export function EvolutionPage({ ranked }: { ranked: Ranked[] }) {
  const focus = useWorkbench((s) => s.focus)
  const focusId = useWorkbench((s) => s.focusId)
  const candidates = useWorkbench((s) => s.candidates)
  const inspect = useWorkbench((s) => s.inspect)
  const setPage = useWorkbench((s) => s.setPage)
  const focusName = usePresetName(focus?.properties.canonicalSmiles ?? null)

  const chain = useMemo(() => ancestry(candidates, focusId), [candidates, focusId])
  const promoted = chain.length > 0

  const nodes = useMemo<Node[]>(() => {
    if (!focus) return []

    if (promoted) {
      // A real lineage: each step actually became the focus molecule.
      return chain.map((c, i) => {
        const entry = ranked.find((r) => r.candidate.id === c.id)
        const isCurrent = c.id === focusId
        return {
          id: c.id,
          label: isCurrent ? 'Current' : `Step ${i + 1}`,
          name: entry ? `Candidate ${rankLabel(entry.rank)}` : shortName(c),
          svg: c.svg,
          properties: c.properties,
          status: isCurrent ? 'Current focus' : 'Promoted',
          tone: isCurrent ? 'accent' : 'ok',
          candidateId: c.id,
        } as Node
      })
    }

    // Nothing promoted yet, so this is exploration around one starting point.
    const explored = [...ranked]
      .sort((a, b) => a.candidate.createdAt - b.candidate.createdAt)
      .slice(0, 6)
    return [
      {
        id: 'start',
        label: 'Start',
        name: focusName ?? 'Focus molecule',
        svg: focus.svg,
        properties: focus.properties,
        status: 'Current focus',
        tone: 'accent',
        // The sentinel, so clicking the start node opens the focus molecule in
        // the same panel a candidate would use.
        candidateId: FOCUS_INSPECT_ID,
      } as Node,
      ...explored.map(
        (entry) =>
          ({
            id: entry.candidate.id,
            label: `Candidate ${rankLabel(entry.rank)}`,
            name: shortName(entry.candidate),
            svg: entry.candidate.svg,
            properties: entry.candidate.properties,
            status:
              entry.candidate.status === 'accepted'
                ? 'Accepted'
                : entry.candidate.status === 'rejected'
                  ? 'Rejected'
                  : 'Generated',
            tone:
              entry.candidate.status === 'accepted'
                ? 'ok'
                : entry.candidate.status === 'rejected'
                  ? 'bad'
                  : 'warn',
            candidateId: entry.candidate.id,
          }) as Node,
      ),
    ]
  }, [focus, focusName, promoted, chain, ranked, focusId])

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
          {promoted
            ? 'The path actually taken: each step became the focus molecule before the next was designed.'
            : 'Nothing has been promoted yet, so this is the exploration around your current focus molecule.'}
        </p>
      </div>

      <section className="surface">
        <SectionHead title={promoted ? 'Lineage' : 'Exploration'} />
        {nodes.length === 0 ? (
          <EmptyState title="No steps recorded yet." />
        ) : (
          <div className="timeline">
            {nodes.map((node, i) => (
              <div key={node.id} className="timeline__step">
                {i > 0 && (
                  <span className="timeline__arrow" aria-hidden="true">
                    →
                  </span>
                )}
                <TimelineNode
                  node={node}
                  onClick={node.candidateId ? () => inspect(node.candidateId!) : undefined}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="evolutionlayout">
        <section className="surface">
          <SectionHead title="Property evolution" />
          {nodes.length < 2 ? (
            <p className="hint">
              One step so far. Trends appear once there is a second molecule to compare against.
            </p>
          ) : (
            <PropertyTrends nodes={nodes} />
          )}
        </section>

        <CurrentFocusPanel focus={focus} nodes={nodes} focusCandidate={focusCandidate} />
      </div>

      <Lineage />
    </div>
  )
}
