import { useState } from 'react'
import { FOCUS_INSPECT_ID, useWorkbench } from '../store/workbench'
import { PRESETS } from '../chem/properties'
import { GROUPS } from '../chem/groups'
import { CONSTRAINT_PRESETS, describeConstraint } from '../chem/constraints'
import { isValidPattern } from '../chem/substructure'
import { download, toCsv, toSmiles } from '../chem/export'
import { diversity } from '../chem/similarity'
import { SORT_OPTIONS, rankLabel, type Ranked, type SortKey } from '../chem/ranking'
import { EmptyState, Metric, SectionHead, StatusBadge } from '../ui/primitives'
import {
  Alerts,
  ConstraintChecks,
  Depiction,
  Groups,
  PropertyGrid,
  Rules,
  TierLegend,
  Warnings,
} from '../ui/molecule'
import { CandidateCard, MiniMolecule, shortName } from '../ui/CandidateCard'
import { usePresetName } from '../ui/usePresetName'
import { useGroupPresence } from '../ui/useGroupPresence'

/**
 * The Design page: the whole point of the application.
 *
 * Reading top to bottom it answers, in order: what am I starting from, what am
 * I trying to achieve, what did the agent find, and how did I get here. The
 * controls that used to occupy three permanent side panels are still all here,
 * folded behind the two buttons that reveal them, because a brief is something
 * you set occasionally and read constantly.
 */

// --- focus molecule ----------------------------------------------------------

function MoleculePicker({ onDone }: { onDone: () => void }) {
  const setFocus = useWorkbench((s) => s.setFocus)
  const note = useWorkbench((s) => s.note)
  const focusSmiles = useWorkbench((s) => s.focus?.properties.canonicalSmiles ?? null)
  const activeName = usePresetName(focusSmiles)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async (smiles: string, presetName?: string) => {
    try {
      await setFocus(smiles)
      setDraft('')
      setError(null)
      note({ actor: 'human', tool: 'set_focus_molecule', detail: presetName || smiles, ok: true })
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="editor">
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault()
          void load(draft)
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          placeholder="Paste a SMILES string"
          aria-label="SMILES"
        />
        <button className="btn btn--primary" type="submit" disabled={!draft.trim()}>
          Load
        </button>
      </form>
      <div className="chips">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            className={'chip' + (activeName === preset.name ? ' chip--on' : '')}
            onClick={() => void load(preset.smiles, preset.name)}
          >
            {preset.name}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function ScaffoldControls() {
  const scaffold = useWorkbench((s) => s.scaffold)
  const focus = useWorkbench((s) => s.focus)
  const setScaffold = useWorkbench((s) => s.setScaffold)
  const note = useWorkbench((s) => s.note)
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const presence = useGroupPresence(focus?.properties.canonicalSmiles ?? null)

  const pin = async (label: string, smarts: string, about: string) => {
    setError(null)
    if (!(await isValidPattern(smarts))) {
      setError(`"${smarts}" is not a valid SMARTS pattern.`)
      return
    }
    await setScaffold({ label, smarts, about })
    note({ actor: 'human', tool: 'pin_scaffold', detail: `${label}  ${smarts}`, ok: true })
  }

  const clear = async () => {
    setError(null)
    await setScaffold(null)
    note({ actor: 'human', tool: 'pin_scaffold', detail: 'cleared', ok: true })
  }

  const presentInFocus = focus?.scaffoldMatch?.matched ?? null

  return (
    <div className="editor__field">
      <h4>Preserve</h4>
      <p className="hint">
        Pin a group and it must survive every proposal. Each candidate is checked, and the agent
        is told when it broke the promise. Only the groups this molecule actually has can be
        pinned &mdash; pinning an absent one would fail every candidate by construction.
      </p>
      <div className="chips">
        {GROUPS.map((group) => {
          // Null while the match is still running: everything stays enabled
          // rather than flickering disabled and back.
          const absent = presence !== null && presence[group.label] === false
          return (
            <button
              key={group.label}
              className={
                'chip' +
                (scaffold?.smarts === group.smarts ? ' chip--on' : '') +
                (absent ? ' chip--absent' : '') +
                (!absent && presence !== null ? ' chip--present' : '')
              }
              disabled={absent}
              title={absent ? `${group.label} is not in this molecule` : group.about}
              onClick={() => void pin(group.label, group.smarts, group.about)}
            >
              {group.label}
            </button>
          )
        })}
        {scaffold && (
          <button className="chip chip--clear" onClick={() => void clear()}>
            clear
          </button>
        )}
      </div>
      <form
        className="row row--tight"
        onSubmit={(event) => {
          event.preventDefault()
          void pin(custom, custom, 'Custom SMARTS pattern.')
        }}
      >
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          spellCheck={false}
          placeholder="or your own SMARTS"
          aria-label="Custom SMARTS pattern"
        />
        <button className="btn" type="submit" disabled={!custom.trim()}>
          Pin
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {scaffold && (
        <div className="pinned">
          <div className="pinned__head">
            <strong>{scaffold.label}</strong>
            <code className="smiles">{scaffold.smarts}</code>
          </div>
          <p className="hint">{scaffold.about}</p>
          {presentInFocus === false && (
            <p className="warn">
              The focus molecule does not contain this group, so every candidate will fail the
              check. Pin something the starting molecule actually has.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function BriefEditor() {
  const goal = useWorkbench((s) => s.goal)
  const setGoal = useWorkbench((s) => s.setGoal)
  const constraints = useWorkbench((s) => s.constraints)
  const setConstraints = useWorkbench((s) => s.setConstraints)
  const note = useWorkbench((s) => s.note)

  return (
    <div className="editor">
      <div className="editor__field">
        <h4>Design goal</h4>
        <input
          className="goal"
          value={goal}
          placeholder="e.g. increase aqueous solubility while preserving the amide and phenol"
          onChange={(e) => setGoal(e.target.value)}
          aria-label="Design goal"
        />
      </div>

      <div className="editor__field">
        <h4>Target profile</h4>
        <p className="hint">
          Every candidate is scored against this, and the agent is told to satisfy all of it at
          once rather than one clause at a time.
        </p>
        <div className="chips">
          {CONSTRAINT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              className={
                'chip' +
                (JSON.stringify(preset.constraints) === JSON.stringify(constraints)
                  ? ' chip--on'
                  : '')
              }
              onClick={() => {
                setConstraints(preset.constraints)
                note({ actor: 'human', tool: 'set_target_profile', detail: preset.name, ok: true })
              }}
            >
              {preset.name}
            </button>
          ))}
          {constraints.length > 0 && (
            <button className="chip chip--clear" onClick={() => setConstraints([])}>
              clear
            </button>
          )}
        </div>
        {constraints.length === 0 ? (
          <p className="hint">No target set. Candidates are judged on rules alone.</p>
        ) : (
          <ul className="cbox__list cbox__list--spaced">
            {constraints.map((c) => (
              <li key={c.key}>{describeConstraint(c)}</li>
            ))}
          </ul>
        )}
      </div>

      <ScaffoldControls />
    </div>
  )
}

function FocusSection() {
  const focus = useWorkbench((s) => s.focus)
  const goal = useWorkbench((s) => s.goal)
  const constraints = useWorkbench((s) => s.constraints)
  const scaffold = useWorkbench((s) => s.scaffold)
  const inspect = useWorkbench((s) => s.inspect)
  const name = usePresetName(focus?.properties.canonicalSmiles ?? null)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showAll, setShowAll] = useState(false)

  if (!focus) {
    return (
      <section className="surface">
        <SectionHead title="Focus molecule" />
        <EmptyState title="No molecule loaded.">
          <MoleculePicker onDone={() => undefined} />
        </EmptyState>
      </section>
    )
  }

  const p = focus.properties

  return (
    <section className="surface focus">
      <SectionHead title="Focus molecule">
        <button className="btn btn--outline" onClick={() => inspect(FOCUS_INSPECT_ID)}>
          Inspect
        </button>
        <button className="btn btn--outline" onClick={() => setPicking((v) => !v)}>
          {picking ? 'Cancel' : 'Change molecule'}
        </button>
      </SectionHead>

      {picking && <MoleculePicker onDone={() => setPicking(false)} />}

      <div className="focus__body">
        <div className="focus__figure">
          <button
            className="focus__figurebtn"
            onClick={() => inspect(FOCUS_INSPECT_ID)}
            title="Inspect the focus molecule"
            aria-label="Inspect the focus molecule"
          >
            <Depiction svg={focus.svg} size="lg" />
          </button>
          {focus.scaffoldMatch?.matched && (
            <p className="hint hint--mark">
              Shaded: the pinned group
              {focus.scaffoldMatch.count > 1
                ? ` (${focus.scaffoldMatch.count} occurrences, first one marked)`
                : ''}
            </p>
          )}
        </div>

        <div className="focus__detail">
          <h3 className="focus__name">{name ?? 'Custom molecule'}</h3>
          <code className="smiles">{p.canonicalSmiles}</code>

          <div className="metrics metrics__inline">
            <Metric label="MW" value={p.mw} title="Molecular weight" />
            <Metric label="LogP" value={p.logP} title="Crippen calculated logP" />
            <Metric label="TPSA" value={p.tpsa} title="Topological polar surface area" />
            <Metric label="HBD" value={p.hbd} title="Hydrogen bond donors" />
            <Metric label="HBA" value={p.hba} title="Hydrogen bond acceptors" />
            <Metric label="RotB" value={p.rotatableBonds} title="Rotatable bonds" />
            <button className="linkbtn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Hide properties' : 'View all properties'}
            </button>
          </div>

          {focus.profile.groups.length > 0 && (
            <div className="focus__groups">
              <h4>Groups present</h4>
              <Groups groups={focus.profile.groups} />
            </div>
          )}

          <div className="brief">
            <div className="brief__col">
              <h4>
                <span className="brief__icon" aria-hidden="true">
                  ◎
                </span>
                Design goal
              </h4>
              <p className={goal ? 'brief__goal' : 'brief__goal brief__goal--empty'}>
                {goal || 'No goal set. Say what you are optimising for.'}
              </p>
            </div>

            <div className="brief__col">
              <h4>
                <span className="brief__icon" aria-hidden="true">
                  ⛉
                </span>
                Constraints
              </h4>
              <div className="brief__tags">
                {scaffold && (
                  <span className="tag tag--pin" title={scaffold.about}>
                    {scaffold.label}
                  </span>
                )}
                {constraints.map((c) => (
                  <span key={c.key} className="tag" title={describeConstraint(c)}>
                    {c.label}
                  </span>
                ))}
                {constraints.length === 0 && !scaffold && (
                  <span className="brief__goal brief__goal--empty">None set.</span>
                )}
              </div>
            </div>

            <button className="btn btn--outline" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Done' : 'Edit brief'}
            </button>
          </div>
        </div>
      </div>

      {editing && <BriefEditor />}

      {showAll && (
        <div className="focus__all">
          <PropertyGrid p={p} />
          <TierLegend />
          <p className="hint">
            Solubility {p.logS} log mol/L (about {p.solubilityMgPerL} mg/L) &mdash;{' '}
            {p.solubilityBand}. Estimated, so treat it as a direction of travel, not a
            measurement.
          </p>
          <Warnings p={p} />
          <Groups groups={focus.profile.groups} />
          <Alerts properties={p} profile={focus.profile} />
          <Rules report={focus.rules} />
          <ConstraintChecks report={focus.constraints} />
        </div>
      )}
    </section>
  )
}

// --- generated analogs -------------------------------------------------------

function BoardActions() {
  const candidates = useWorkbench((s) => s.candidates)
  const reset = useWorkbench((s) => s.reset)

  if (candidates.length === 0) return null

  return (
    <>
      <button
        className="btn btn--ghost"
        onClick={() => download('analog-board.csv', toCsv(candidates), 'text/csv')}
      >
        Export CSV
      </button>
      <button
        className="btn btn--ghost"
        onClick={() =>
          download('analog-board.smi', toSmiles(candidates), 'chemical/x-daylight-smiles')
        }
      >
        Export SMILES
      </button>
      <button
        className="btn btn--ghost"
        onClick={() => {
          if (confirm('Clear the board and the saved session? This cannot be undone.')) {
            reset()
            void useWorkbench.getState().setFocus(PRESETS[0].smiles)
          }
        }}
      >
        Clear board
      </button>
    </>
  )
}

function AnalogsSection({
  ranked,
  sort,
  setSort,
}: {
  ranked: Ranked[]
  sort: SortKey
  setSort: (k: SortKey) => void
}) {
  const focus = useWorkbench((s) => s.focus)
  const candidates = useWorkbench((s) => s.candidates)
  const pending = candidates.filter((c) => c.status === 'pending').length
  const alive = candidates.filter((c) => c.status !== 'rejected')
  const spread = diversity(alive.map((c) => c.fp))

  return (
    <section className="surface">
      <SectionHead
        title="Generated analogs"
        count={
          candidates.length > 0 ? (
            <StatusBadge
              label={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}
              tone="neutral"
            />
          ) : null
        }
      >
        {candidates.length > 0 && (
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
        )}
        <BoardActions />
      </SectionHead>

      {pending > 0 && (
        <p className="hint">
          {pending} proposal{pending > 1 ? 's' : ''} waiting on you. Nothing becomes the focus
          molecule until you say so.
        </p>
      )}

      {spread !== null && (
        <p className="hint">
          Board diversity {spread} &mdash;{' '}
          {spread < 0.3
            ? 'these are variations on one idea, not separate ideas.'
            : 'a genuine spread of chemistry.'}
        </p>
      )}

      {candidates.length === 0 ? (
        <EmptyState title="No candidates yet." icon="⌬">
          <p>
            Ask your agent: <em>Propose three more soluble paracetamol analogs, and predict logP
            before you compute it.</em>
          </p>
        </EmptyState>
      ) : (
        <div className="cgrid">
          {ranked.map((entry) => (
            <CandidateCard key={entry.candidate.id} entry={entry} focus={focus} />
          ))}
        </div>
      )}
    </section>
  )
}

// --- evolution strip ---------------------------------------------------------

function EvolutionStrip({ ranked }: { ranked: Ranked[] }) {
  const focus = useWorkbench((s) => s.focus)
  const focusId = useWorkbench((s) => s.focusId)
  const inspect = useWorkbench((s) => s.inspect)
  const setPage = useWorkbench((s) => s.setPage)
  const shortlist = useWorkbench((s) => s.shortlist)

  const chain = [...ranked]
    .sort((a, b) => a.candidate.createdAt - b.candidate.createdAt)
    .slice(0, 5)

  if (!focus || chain.length === 0) return null

  return (
    <section className="surface">
      <SectionHead title="Molecule evolution">
        <button className="btn btn--ghost" onClick={() => setPage('evolution')}>
          View full evolution
        </button>
      </SectionHead>
      <div className="strip">
        <MiniMolecule
          svg={focus.svg}
          title="Focus molecule"
          subtitle="Starting point"
          onClick={() => inspect(FOCUS_INSPECT_ID)}
        />
        {chain.map((entry) => (
          <div key={entry.candidate.id} className="strip__step">
            <span className="strip__arrow" aria-hidden="true">
              →
            </span>
            <MiniMolecule
              svg={entry.candidate.svg}
              title={`Candidate ${rankLabel(entry.rank)}`}
              subtitle={shortName(entry.candidate)}
              status={
                entry.candidate.status === 'accepted'
                  ? focusId === entry.candidate.id
                    ? 'Current focus'
                    : 'Accepted'
                  : entry.candidate.status === 'rejected'
                    ? 'Rejected'
                    : shortlist.includes(entry.candidate.id)
                      ? 'Shortlisted'
                      : 'Generated'
              }
              tone={
                entry.candidate.status === 'accepted'
                  ? 'ok'
                  : entry.candidate.status === 'rejected'
                    ? 'bad'
                    : 'warn'
              }
              onClick={() => inspect(entry.candidate.id)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

export function DesignPage({
  ranked,
  sort,
  setSort,
}: {
  ranked: Ranked[]
  sort: SortKey
  setSort: (k: SortKey) => void
}) {
  return (
    <div className="page">
      <FocusSection />
      <AnalogsSection ranked={ranked} sort={sort} setSort={setSort} />
      <EvolutionStrip ranked={ranked} />
    </div>
  )
}
