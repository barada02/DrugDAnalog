import { create } from 'zustand'
import { computeProperties, renderSvg } from '../chem/properties'
import type { Properties } from '../chem/properties'
import { assess } from '../chem/rules'
import type { RuleReport } from '../chem/rules'
import { matchPattern } from '../chem/substructure'
import type { Match } from '../chem/substructure'
import { fingerprint, tanimoto } from '../chem/similarity'
import type { Fingerprint } from '../chem/similarity'
import { clear as clearSaved, load, save, toSeed } from './persist'
import { profile } from '../chem/profile'
import type { Profile } from '../chem/profile'
import { checkConstraints } from '../chem/constraints'
import type { Constraint, ConstraintReport } from '../chem/constraints'

/**
 * The part of the molecule the human has told everyone to leave alone.
 * Null means nothing is pinned and no proposal can fail the check.
 */
export type Scaffold = { label: string; smarts: string; about: string }

/** What the agent claimed BEFORE the oracle ran. Every field optional. */
export type Prediction = Partial<Pick<Properties, 'mw' | 'logP' | 'tpsa'>>

export type ScoreRow = { field: keyof Prediction; predicted: number; actual: number; error: number }

export type Candidate = {
  id: string
  smiles: string
  properties: Properties
  rules: RuleReport
  svg: string
  rationale: string
  source: 'human' | 'agent'
  parentSmiles: string | null
  /**
   * The candidate this was designed from, or null if it came off a molecule
   * loaded straight into focus. This is the edge the lineage tree draws.
   */
  parentId: string | null
  fp: Fingerprint
  /** Tanimoto against the parent. Low means the agent changed more than it said. */
  similarityToParent: number | null
  profile: Profile
  /** Scored against the human's stated constraints, empty when none are set. */
  constraints: ConstraintReport
  prediction: Prediction | null
  scorecard: ScoreRow[]
  /** null when no scaffold was pinned, so "not checked" never reads as "failed". */
  scaffoldOk: boolean | null
  /**
   * The approval gate. Agents may only create `pending`; promoting a candidate
   * to `accepted` is a human act and nothing in the tool surface can do it.
   */
  status: CandidateStatus
  decidedAt: number | null
  createdAt: number
}

export type CandidateStatus = 'pending' | 'accepted' | 'rejected'

/** Which workspace the human is looking at. Purely presentational. */
export type Page = 'overview' | 'design' | 'explore' | 'compare' | 'evolution' | 'settings' | 'help'

/** Tabs inside the inspection drawer. */
export type InspectTab = 'overview' | 'properties' | 'predictions' | 'synthesis' | 'notes'

export type LogEntry = {
  id: string
  at: number
  actor: 'human' | 'agent'
  tool: string
  detail: string
  ok: boolean
}

export type Molecule = {
  properties: Properties
  rules: RuleReport
  svg: string
  scaffoldMatch: Match | null
  fp: Fingerprint
  profile: Profile
  constraints: ConstraintReport
}

type WorkbenchState = {
  rdkitStatus: 'loading' | 'ready' | 'error'
  rdkitError: string | null
  goal: string
  scaffold: Scaffold | null
  constraints: Constraint[]
  focus: Molecule | null
  /**
   * Which candidate the focus molecule is, when it is one. Null when the human
   * typed a SMILES straight in. New proposals hang off this, which is what
   * makes the lineage a real tree rather than a flat list.
   */
  focusId: string | null
  candidates: Candidate[]
  log: LogEntry[]

  // --- presentation only ---------------------------------------------------
  // None of this is persisted and no WebMCP tool can reach it. It exists so the
  // shell, the drawer and the compare tray can remember where the human was.
  /** Which page the shell is showing. */
  page: Page
  /** Candidate open in the inspection drawer, or null when it is closed. */
  inspectId: string | null
  inspectTab: InspectTab
  /** Candidate ids staged on the Compare page, in the order they were picked. */
  compareIds: string[]
  /** Human shortlist ("starred"), separate from the accept/reject decision. */
  shortlist: string[]
  /** Free-text notes the human keeps against a candidate, keyed by id. */
  candidateNotes: Record<string, string>
  /** Whether the developer/agent trace panel is open. */
  traceOpen: boolean
}

type WorkbenchActions = {
  setRdkitStatus: (status: WorkbenchState['rdkitStatus'], error?: string) => void
  setGoal: (goal: string) => void
  setScaffold: (scaffold: Scaffold | null) => Promise<void>
  setConstraints: (constraints: Constraint[]) => void
  setFocus: (smiles: string, candidateId?: string | null) => Promise<Molecule>
  addCandidate: (input: {
    smiles: string
    rationale?: string
    prediction?: Prediction | null
    source: 'human' | 'agent'
  }) => Promise<Candidate>
  decide: (id: string, status: Exclude<CandidateStatus, 'pending'>) => void
  /**
   * Take a candidate off the board for good. Rejecting keeps a decision on the
   * record; this is for things that should never have been there.
   */
  remove: (id: string) => void
  /** Make an accepted candidate the focus, recording it as the parent of what follows. */
  promote: (id: string) => Promise<Molecule>
  /** Rebuild a saved session. Returns false when there was nothing to restore. */
  restore: () => Promise<boolean>
  reset: () => void
  note: (entry: Omit<LogEntry, 'id' | 'at'>) => void

  // --- presentation only ---------------------------------------------------
  setPage: (page: Page) => void
  /** Open the drawer on a candidate, or pass null to close it. */
  inspect: (id: string | null) => void
  setInspectTab: (tab: InspectTab) => void
  /** Add or remove a candidate from the compare tray. Capped at five. */
  toggleCompare: (id: string) => void
  setCompareIds: (ids: string[]) => void
  toggleShortlist: (id: string) => void
  setCandidateNote: (id: string, text: string) => void
  setTraceOpen: (open: boolean) => void
}

/** The compare table stops being readable past five columns plus the focus. */
export const MAX_COMPARE = 5

/**
 * Stands in for the focus molecule in `inspectId`, which otherwise only ever
 * holds a candidate id. Cannot collide: candidate ids come from
 * crypto.randomUUID().
 */
export const FOCUS_INSPECT_ID = '__focus__'

const id = () => crypto.randomUUID()

/** Tolerances above which a prediction counts as wrong. */
const TOLERANCE: Record<keyof Prediction, number> = { mw: 5, logP: 0.5, tpsa: 5 }

function score(prediction: Prediction | null | undefined, actual: Properties): ScoreRow[] {
  if (!prediction) return []
  return (Object.keys(TOLERANCE) as (keyof Prediction)[])
    .filter((field) => typeof prediction[field] === 'number')
    .map((field) => {
      const predicted = prediction[field] as number
      const value = actual[field]
      return { field, predicted, actual: value, error: Number((value - predicted).toFixed(2)) }
    })
}

/**
 * One molecule, fully worked out: descriptors, rule verdict, a picture, and --
 * when a scaffold is pinned -- whether it survived, with the match shaded in
 * the picture.
 */
export async function buildMolecule(
  smiles: string,
  scaffold: Scaffold | null,
  constraints: Constraint[] = [],
): Promise<Molecule> {
  const properties = await computeProperties(smiles)
  const scaffoldMatch = scaffold ? await matchPattern(smiles, scaffold.smarts) : null
  const svg = await renderSvg(
    smiles,
    scaffoldMatch?.matched ? { atoms: scaffoldMatch.atoms, bonds: scaffoldMatch.bonds } : {},
  )
  const fp = await fingerprint(smiles)
  return {
    properties,
    rules: assess(properties),
    svg,
    scaffoldMatch,
    fp,
    profile: await profile(smiles),
    constraints: checkConstraints(properties, constraints),
  }
}

/**
 * Plain store, deliberately reachable outside React via `useWorkbench.getState()`.
 * WebMCP tools call these actions directly; components subscribe with the hook.
 * Board state must never live in useState/Context — a tool cannot reach either.
 */
export const useWorkbench = create<WorkbenchState & WorkbenchActions>((set, get) => ({
  rdkitStatus: 'loading',
  rdkitError: null,
  goal: '',
  scaffold: null,
  constraints: [],
  focus: null,
  focusId: null,
  candidates: [],
  log: [],

  page: 'design',
  inspectId: null,
  inspectTab: 'overview',
  compareIds: [],
  shortlist: [],
  candidateNotes: {},
  traceOpen: false,

  setRdkitStatus: (rdkitStatus, rdkitError = undefined) =>
    set({ rdkitStatus, rdkitError: rdkitError ?? null }),

  setGoal: (goal) => set({ goal }),

  /**
   * Pinning a scaffold is retroactive: everything already on the board is
   * re-checked and re-drawn against the new pattern. A card that silently kept
   * an old verdict would be worse than no verdict at all.
   */
  setScaffold: async (scaffold) => {
    const { focus, candidates } = get()
    const [nextFocus, nextCandidates] = await Promise.all([
      focus ? buildMolecule(focus.properties.canonicalSmiles, scaffold, get().constraints) : null,
      Promise.all(
        candidates.map(async (candidate) => {
          const molecule = await buildMolecule(candidate.smiles, scaffold, get().constraints)
          return {
            ...candidate,
            svg: molecule.svg,
            profile: molecule.profile,
            constraints: molecule.constraints,
            scaffoldOk: scaffold ? (molecule.scaffoldMatch?.matched ?? false) : null,
          }
        }),
      ),
    ])
    set({ scaffold, candidates: nextCandidates, ...(nextFocus ? { focus: nextFocus } : {}) })
  },

  setConstraints: (constraints) =>
    set((state) => ({
      constraints,
      focus: state.focus && {
        ...state.focus,
        constraints: checkConstraints(state.focus.properties, constraints),
      },
      candidates: state.candidates.map((c) => ({
        ...c,
        constraints: checkConstraints(c.properties, constraints),
      })),
    })),

  setFocus: async (smiles, candidateId = null) => {
    const molecule = await buildMolecule(smiles, get().scaffold, get().constraints)
    set({ focus: molecule, focusId: candidateId })
    return molecule
  },

  addCandidate: async ({ smiles, rationale = '', prediction = null, source }) => {
    const { scaffold, focus, focusId } = get()
    const { properties, rules, svg, scaffoldMatch, fp, profile: prof, constraints } =
      await buildMolecule(smiles, scaffold, get().constraints)
    const candidate: Candidate = {
      id: id(),
      smiles,
      properties,
      rules,
      svg,
      rationale,
      source,
      parentSmiles: focus?.properties.canonicalSmiles ?? null,
      parentId: focusId,
      fp,
      similarityToParent: focus ? tanimoto(fp, focus.fp) : null,
      profile: prof,
      constraints,
      prediction,
      scorecard: score(prediction, properties),
      scaffoldOk: scaffold ? (scaffoldMatch?.matched ?? false) : null,
      // A molecule the human typed in is already approved -- it is theirs.
      // Anything an agent proposes waits.
      status: source === 'human' ? 'accepted' : 'pending',
      decidedAt: source === 'human' ? Date.now() : null,
      createdAt: Date.now(),
    }
    set((state) => ({ candidates: [candidate, ...state.candidates] }))
    return candidate
  },

  decide: (id, status) =>
    set((state) => ({
      candidates: state.candidates.map((candidate) =>
        candidate.id === id ? { ...candidate, status, decidedAt: Date.now() } : candidate,
      ),
    })),

  /**
   * Children are spliced onto the removed candidate's own parent rather than
   * deleted with it or left pointing at nothing. Losing one idea should not
   * silently orphan the work that came after it, and a dangling parentId would
   * make a whole branch look like it started from the root.
   */
  remove: (id) =>
    set((state) => {
      const victim = state.candidates.find((c) => c.id === id)
      if (!victim) return {}
      const inherited = victim.parentId
      const { [id]: _removed, ...candidateNotes } = state.candidateNotes
      return {
        candidates: state.candidates
          .filter((c) => c.id !== id)
          .map((c) => (c.parentId === id ? { ...c, parentId: inherited } : c)),
        candidateNotes,
        compareIds: state.compareIds.filter((c) => c !== id),
        shortlist: state.shortlist.filter((s) => s !== id),
        inspectId: state.inspectId === id ? null : state.inspectId,
        // The molecule stays in focus; it just stops being a board candidate.
        focusId: state.focusId === id ? null : state.focusId,
      }
    }),

  promote: async (candidateId) => {
    const candidate = get().candidates.find((c) => c.id === candidateId)
    if (!candidate) throw new Error(`No candidate with id ${candidateId}`)
    return get().setFocus(candidate.smiles, candidateId)
  },

  note: (entry) =>
    set((state) => ({ log: [{ ...entry, id: id(), at: Date.now() }, ...state.log].slice(0, 100) })),

  /**
   * Rehydrate from the seed, recomputing every derived value. Candidates are
   * rebuilt in creation order so lineage and parent similarity resolve against
   * a board that already contains their parent.
   */
  restore: async () => {
    const seed = load()
    if (!seed) return false

    const scaffold = seed.scaffold
    const ordered = [...seed.candidates].sort((a, b) => a.createdAt - b.createdAt)

    const rebuilt: Candidate[] = []
    for (const saved of ordered) {
      try {
        const { properties, rules, svg, scaffoldMatch, fp, profile: prof, constraints } =
          await buildMolecule(saved.smiles, scaffold, seed.constraints ?? [])
        const parent = rebuilt.find((c) => c.id === saved.parentId)
        rebuilt.push({
          ...saved,
          properties,
          rules,
          svg,
          fp,
          profile: prof,
          constraints,
          parentSmiles: parent?.properties.canonicalSmiles ?? null,
          similarityToParent: parent ? tanimoto(fp, parent.fp) : null,
          scorecard: score(saved.prediction, properties),
          scaffoldOk: scaffold ? (scaffoldMatch?.matched ?? false) : null,
        })
      } catch {
        // A SMILES that no longer parses is dropped rather than failing the
        // whole restore. One bad card must not cost the session.
      }
    }

    const focus = seed.focusSmiles
      ? await buildMolecule(seed.focusSmiles, scaffold, seed.constraints ?? [])
      : null
    set({
      goal: seed.goal,
      scaffold,
      constraints: seed.constraints ?? [],
      focus,
      focusId: seed.focusId,
      candidates: [...rebuilt].reverse(),
    })
    return true
  },

  reset: () => {
    clearSaved()
    set({
      goal: '',
      scaffold: null,
      constraints: [],
      focus: null,
      focusId: null,
      candidates: [],
      log: [],
      inspectId: null,
      compareIds: [],
      shortlist: [],
      candidateNotes: {},
    })
  },

  // --- presentation only -----------------------------------------------------

  setPage: (page) => set({ page }),

  // Opening the drawer always lands on Overview. Reopening a different molecule
  // on whatever tab the last one was left on reads as a glitch.
  inspect: (inspectId) =>
    set((state) => ({
      inspectId,
      inspectTab: inspectId && inspectId !== state.inspectId ? 'overview' : state.inspectTab,
    })),

  setInspectTab: (inspectTab) => set({ inspectTab }),

  toggleCompare: (id) =>
    set((state) => ({
      compareIds: state.compareIds.includes(id)
        ? state.compareIds.filter((c) => c !== id)
        : state.compareIds.length >= MAX_COMPARE
          ? state.compareIds
          : [...state.compareIds, id],
    })),

  setCompareIds: (ids) => set({ compareIds: ids.slice(0, MAX_COMPARE) }),

  toggleShortlist: (id) =>
    set((state) => ({
      shortlist: state.shortlist.includes(id)
        ? state.shortlist.filter((s) => s !== id)
        : [...state.shortlist, id],
    })),

  setCandidateNote: (id, text) =>
    set((state) => ({ candidateNotes: { ...state.candidateNotes, [id]: text } })),

  setTraceOpen: (traceOpen) => set({ traceOpen }),
}))

/**
 * Persist on every change that alters the board. Subscribing here rather than
 * writing inside each action means no future action can forget to save.
 */
useWorkbench.subscribe((state, previous) => {
  if (
    state.candidates === previous.candidates &&
    state.goal === previous.goal &&
    state.scaffold === previous.scaffold &&
    state.constraints === previous.constraints &&
    state.focus === previous.focus
  ) {
    return
  }
  save(
    toSeed({
      goal: state.goal,
      scaffold: state.scaffold,
      constraints: state.constraints,
      focusSmiles: state.focus?.properties.canonicalSmiles ?? null,
      focusId: state.focusId,
      candidates: state.candidates,
    }),
  )
})
