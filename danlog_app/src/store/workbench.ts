import { create } from 'zustand'
import { computeProperties, renderSvg } from '../chem/properties'
import type { Properties } from '../chem/properties'
import { assess } from '../chem/rules'
import type { RuleReport } from '../chem/rules'
import { matchPattern } from '../chem/substructure'
import type { Match } from '../chem/substructure'
import { fingerprint, tanimoto } from '../chem/similarity'
import type { Fingerprint } from '../chem/similarity'

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
}

type WorkbenchState = {
  rdkitStatus: 'loading' | 'ready' | 'error'
  rdkitError: string | null
  goal: string
  scaffold: Scaffold | null
  focus: Molecule | null
  /**
   * Which candidate the focus molecule is, when it is one. Null when the human
   * typed a SMILES straight in. New proposals hang off this, which is what
   * makes the lineage a real tree rather than a flat list.
   */
  focusId: string | null
  candidates: Candidate[]
  log: LogEntry[]
}

type WorkbenchActions = {
  setRdkitStatus: (status: WorkbenchState['rdkitStatus'], error?: string) => void
  setGoal: (goal: string) => void
  setScaffold: (scaffold: Scaffold | null) => Promise<void>
  setFocus: (smiles: string, candidateId?: string | null) => Promise<Molecule>
  addCandidate: (input: {
    smiles: string
    rationale?: string
    prediction?: Prediction | null
    source: 'human' | 'agent'
  }) => Promise<Candidate>
  decide: (id: string, status: Exclude<CandidateStatus, 'pending'>) => void
  /** Make an accepted candidate the focus, recording it as the parent of what follows. */
  promote: (id: string) => Promise<Molecule>
  note: (entry: Omit<LogEntry, 'id' | 'at'>) => void
}

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
): Promise<Molecule> {
  const properties = await computeProperties(smiles)
  const scaffoldMatch = scaffold ? await matchPattern(smiles, scaffold.smarts) : null
  const svg = await renderSvg(
    smiles,
    scaffoldMatch?.matched ? { atoms: scaffoldMatch.atoms, bonds: scaffoldMatch.bonds } : {},
  )
  const fp = await fingerprint(smiles)
  return { properties, rules: assess(properties), svg, scaffoldMatch, fp }
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
  focus: null,
  focusId: null,
  candidates: [],
  log: [],

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
      focus ? buildMolecule(focus.properties.canonicalSmiles, scaffold) : null,
      Promise.all(
        candidates.map(async (candidate) => {
          const molecule = await buildMolecule(candidate.smiles, scaffold)
          return {
            ...candidate,
            svg: molecule.svg,
            scaffoldOk: scaffold ? (molecule.scaffoldMatch?.matched ?? false) : null,
          }
        }),
      ),
    ])
    set({ scaffold, candidates: nextCandidates, ...(nextFocus ? { focus: nextFocus } : {}) })
  },

  setFocus: async (smiles, candidateId = null) => {
    const molecule = await buildMolecule(smiles, get().scaffold)
    set({ focus: molecule, focusId: candidateId })
    return molecule
  },

  addCandidate: async ({ smiles, rationale = '', prediction = null, source }) => {
    const { scaffold, focus, focusId } = get()
    const { properties, rules, svg, scaffoldMatch, fp } = await buildMolecule(smiles, scaffold)
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

  promote: async (candidateId) => {
    const candidate = get().candidates.find((c) => c.id === candidateId)
    if (!candidate) throw new Error(`No candidate with id ${candidateId}`)
    return get().setFocus(candidate.smiles, candidateId)
  },

  note: (entry) =>
    set((state) => ({ log: [{ ...entry, id: id(), at: Date.now() }, ...state.log].slice(0, 100) })),
}))
