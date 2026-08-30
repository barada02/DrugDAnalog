import { create } from 'zustand'
import { evaluate } from '../chem/constraints'
import type { Constraint, Verdict } from '../chem/constraints'
import { computeProperties, lipinski, renderSvg } from '../chem/properties'
import type { LipinskiResult, Properties } from '../chem/properties'

/** What the agent claimed BEFORE the oracle ran. Every field optional. */
export type Prediction = Partial<Pick<Properties, 'mw' | 'logP' | 'tpsa'>>

export type ScoreRow = { field: keyof Prediction; predicted: number; actual: number; error: number }

export type Candidate = {
  id: string
  smiles: string
  properties: Properties
  lipinski: LipinskiResult
  svg: string
  rationale: string
  source: 'human' | 'agent'
  parentSmiles: string | null
  prediction: Prediction | null
  scorecard: ScoreRow[]
  /** Result of checking the human's constraints. Empty constraint list accepts. */
  verdict: Verdict
  createdAt: number
}

export type LogEntry = {
  id: string
  at: number
  actor: 'human' | 'agent'
  tool: string
  detail: string
  ok: boolean
}

export type Molecule = { properties: Properties; lipinski: LipinskiResult; svg: string }

/**
 * Constraint minus its id. Distributed over the union by hand, because a plain
 * Omit on a discriminated union collapses it to the shared keys.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type DraftConstraint = DistributiveOmit<Constraint, 'id'>

type WorkbenchState = {
  rdkitStatus: 'loading' | 'ready' | 'error'
  rdkitError: string | null
  goal: string
  constraints: Constraint[]
  focus: Molecule | null
  candidates: Candidate[]
  log: LogEntry[]
}

type WorkbenchActions = {
  setRdkitStatus: (status: WorkbenchState['rdkitStatus'], error?: string) => void
  setGoal: (goal: string) => void
  addConstraint: (constraint: DraftConstraint) => Constraint
  removeConstraint: (id: string) => void
  setFocus: (smiles: string) => Promise<Molecule>
  addCandidate: (input: {
    smiles: string
    rationale?: string
    prediction?: Prediction | null
    source: 'human' | 'agent'
  }) => Promise<Candidate>
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

export async function buildMolecule(smiles: string): Promise<Molecule> {
  const properties = await computeProperties(smiles)
  const [svg] = await Promise.all([renderSvg(smiles)])
  return { properties, lipinski: lipinski(properties), svg }
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
  constraints: [],
  focus: null,
  candidates: [],
  log: [],

  setRdkitStatus: (rdkitStatus, rdkitError = undefined) =>
    set({ rdkitStatus, rdkitError: rdkitError ?? null }),

  setGoal: (goal) => set({ goal }),

  addConstraint: (draft) => {
    const constraint = { ...draft, id: id() } as Constraint
    set((state) => ({ constraints: [...state.constraints, constraint] }))
    return constraint
  },

  removeConstraint: (constraintId) =>
    set((state) => ({ constraints: state.constraints.filter((c) => c.id !== constraintId) })),

  setFocus: async (smiles) => {
    const molecule = await buildMolecule(smiles)
    set({ focus: molecule })
    return molecule
  },

  addCandidate: async ({ smiles, rationale = '', prediction = null, source }) => {
    const { properties, lipinski: rules, svg } = await buildMolecule(smiles)
    // Constraints are read at proposal time, so a candidate records the verdict
    // against the rules that were in force when it was proposed.
    const verdict = await evaluate(smiles, properties, get().constraints)
    const candidate: Candidate = {
      id: id(),
      smiles,
      properties,
      lipinski: rules,
      svg,
      rationale,
      source,
      parentSmiles: get().focus?.properties.canonicalSmiles ?? null,
      prediction,
      scorecard: score(prediction, properties),
      verdict,
      createdAt: Date.now(),
    }
    set((state) => ({ candidates: [candidate, ...state.candidates] }))
    return candidate
  },

  note: (entry) =>
    set((state) => ({ log: [{ ...entry, id: id(), at: Date.now() }, ...state.log].slice(0, 100) })),
}))
