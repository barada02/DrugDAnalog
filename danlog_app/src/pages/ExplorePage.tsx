import { useMemo, useState } from 'react'
import { useWorkbench } from '../store/workbench'
import { SORT_OPTIONS, type Ranked, type SortKey } from '../chem/ranking'
import { EmptyState, SectionHead, StatusBadge } from '../ui/primitives'
import { CandidateCard } from '../ui/CandidateCard'

/**
 * Explore: the whole board, with the filters the Design page deliberately
 * leaves out. Design is for the shortlist the agent produced; this is for
 * digging through everything that has ever been on the board.
 */

type StatusFilter = 'all' | 'pending' | 'accepted' | 'rejected' | 'shortlisted'

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Awaiting decision' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'rejected', label: 'Rejected' },
]

export function ExplorePage({
  ranked,
  sort,
  setSort,
}: {
  ranked: Ranked[]
  sort: SortKey
  setSort: (k: SortKey) => void
}) {
  const focus = useWorkbench((s) => s.focus)
  const scaffold = useWorkbench((s) => s.scaffold)
  const constraints = useWorkbench((s) => s.constraints)
  const shortlist = useWorkbench((s) => s.shortlist)
  const setPage = useWorkbench((s) => s.setPage)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [rulesOnly, setRulesOnly] = useState(false)
  const [goalsOnly, setGoalsOnly] = useState(false)
  const [keptOnly, setKeptOnly] = useState(false)
  const [maxSa, setMaxSa] = useState(10)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return ranked.filter(({ candidate }) => {
      if (needle) {
        const hay = (
          candidate.properties.canonicalSmiles +
          ' ' +
          candidate.rationale
        ).toLowerCase()
        if (!hay.includes(needle)) return false
      }
      if (status === 'shortlisted' && !shortlist.includes(candidate.id)) return false
      if (status !== 'all' && status !== 'shortlisted' && candidate.status !== status) return false
      if (rulesOnly && !candidate.rules.passes) return false
      if (goalsOnly && !(candidate.constraints.total > 0 && candidate.constraints.allMet))
        return false
      if (keptOnly && candidate.scaffoldOk !== true) return false
      if (candidate.properties.saScore > maxSa) return false
      return true
    })
  }, [ranked, query, status, rulesOnly, goalsOnly, keptOnly, maxSa, shortlist])

  return (
    <div className="page">
      <div className="pagehead">
        <h1>Explore</h1>
        <p>Everything that has been on this board, filtered however you need it.</p>
      </div>

      <section className="surface">
        <SectionHead title="Filters">
          <label className="sort">
            <span>Sorted by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </SectionHead>

        <div className="filters">
          <input
            className="filters__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SMILES or rationale"
            aria-label="Search candidates"
            spellCheck={false}
          />

          <div className="chips">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                className={'chip' + (status === f.key ? ' chip--on' : '')}
                onClick={() => setStatus(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="filters__toggles">
            <label>
              <input
                type="checkbox"
                checked={rulesOnly}
                onChange={(e) => setRulesOnly(e.target.checked)}
              />
              All rules pass
            </label>
            <label title={constraints.length === 0 ? 'No target profile set' : undefined}>
              <input
                type="checkbox"
                checked={goalsOnly}
                disabled={constraints.length === 0}
                onChange={(e) => setGoalsOnly(e.target.checked)}
              />
              Meets target profile
            </label>
            <label title={scaffold ? undefined : 'Nothing pinned'}>
              <input
                type="checkbox"
                checked={keptOnly}
                disabled={!scaffold}
                onChange={(e) => setKeptOnly(e.target.checked)}
              />
              {scaffold ? `${scaffold.label} preserved` : 'Scaffold preserved'}
            </label>
            <label className="filters__range">
              Max SA score <strong>{maxSa}</strong>
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={maxSa}
                onChange={(e) => setMaxSa(Number(e.target.value))}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="surface">
        <SectionHead
          title="Results"
          count={
            <StatusBadge
              label={`${filtered.length} of ${ranked.length}`}
              tone={filtered.length === 0 ? 'warn' : 'neutral'}
            />
          }
        />
        {ranked.length === 0 ? (
          <EmptyState title="The board is empty." icon="⌬">
            <p>
              Generate candidates on the{' '}
              <button className="linkbtn" onClick={() => setPage('design')}>
                Design page
              </button>{' '}
              first.
            </p>
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState title="No candidate matches these filters.">
            <button
              className="linkbtn"
              onClick={() => {
                setQuery('')
                setStatus('all')
                setRulesOnly(false)
                setGoalsOnly(false)
                setKeptOnly(false)
                setMaxSa(10)
              }}
            >
              Clear all filters
            </button>
          </EmptyState>
        ) : (
          <div className="cgrid">
            {filtered.map((entry) => (
              <CandidateCard key={entry.candidate.id} entry={entry} focus={focus} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
