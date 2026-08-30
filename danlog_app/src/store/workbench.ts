import { create } from 'zustand'
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

type WorkbenchState = {
  rdkitStatus: 'loading' | 'ready' | 'error'
  rdkitError: string | null
  goal: string
  focus: Molecule | null
  candidates: Candidate[]
  log: LogEntry[]
}

type WorkbenchActions = {
  setRdkitStatus: (status: WorkbenchState['rdkitStatus'], error?: string) => void
  setGoal: (goal: string) => void
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
  focus: null,
  candidates: [],
  log: [],

  setRdkitStatus: (rdkitStatus, rdkitError = undefined) =>
    set({ rdkitStatus, rdkitError: rdkitError ?? null }),

  setGoal: (goal) => set({ goal }),

  setFocus: async (smiles) => {
    const molecule = await buildMolecule(smiles)
    set({ focus: molecule })
    return molecule
  },

  addCandidate: async ({ smiles, rationale = '', prediction = null, source }) => {
    const { properties, lipinski: rules, svg } = await buildMolecule(smiles)
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
      createdAt: Date.now(),
    }
    set((state) => ({ candidates: [candidate, ...state.candidates] }))
    return candidate
  },

  note: (entry) =>
    set((state) => ({ log: [{ ...entry, id: id(), at: Date.now() }, ...state.log].slice(0, 100) })),
}))
