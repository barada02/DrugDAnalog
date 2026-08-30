import { computeProperties, lipinski } from '../chem/properties'
import { useWorkbench } from '../store/workbench'
import type { Prediction } from '../store/workbench'
import type { ToolDescriptor, ToolResult } from './webmcp'

const ok = (payload: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
})

const store = () => useWorkbench.getState()

const SMILES_PARAM = {
  type: 'string',
  description: 'A SMILES string, e.g. CC(=O)Oc1ccccc1C(=O)O for aspirin.',
} as const

const TOOLS: ToolDescriptor[] = [
  {
    name: 'get_workbench_state',
    description:
      'Read the whole workbench: the design goal, the focus molecule with its computed ' +
      'properties, and every candidate on the board with its Lipinski verdict and ' +
      'prediction scorecard. Call this before proposing anything, and again after, because ' +
      'the human changes the board while you work.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: () => {
      const { goal, focus, candidates } = store()
      return ok({
        goal: goal || null,
        focus: focus && { ...focus.properties, lipinski: focus.lipinski },
        candidates: candidates.map((c) => ({
          id: c.id,
          smiles: c.properties.canonicalSmiles,
          source: c.source,
          rationale: c.rationale,
          properties: c.properties,
          lipinski: c.lipinski,
          scorecard: c.scorecard,
        })),
      })
    },
  },
  {
    name: 'get_molecule_properties',
    description:
      'Compute real molecular descriptors for a SMILES string with RDKit: molecular weight, ' +
      'cLogP, TPSA, hydrogen bond donors and acceptors, rotatable bonds, rings, plus a ' +
      "Lipinski rule-of-five verdict naming each violated rule. This is measured, not " +
      'estimated — never state a property value you have not obtained from this tool. ' +
      'Throws if the SMILES is invalid.',
    inputSchema: {
      type: 'object',
      properties: { smiles: SMILES_PARAM },
      required: ['smiles'],
    },
    annotations: { readOnlyHint: true },
    execute: async ({ smiles }: { smiles: string }) => {
      const properties = await computeProperties(smiles)
      store().note({ actor: 'agent', tool: 'get_molecule_properties', detail: smiles, ok: true })
      return ok({ ...properties, lipinski: lipinski(properties) })
    },
  },
  {
    name: 'propose_candidate',
    description:
      'Add a candidate analog to the design board and get its real computed properties back. ' +
      'State your predicted mw, logP and tpsa first: the tool scores your prediction against ' +
      'what RDKit actually measures and returns the error on each. Use that feedback to ' +
      'correct yourself before proposing the next analog. The candidate lands as a pending ' +
      'card — the human decides what is kept.',
    inputSchema: {
      type: 'object',
      properties: {
        smiles: SMILES_PARAM,
        rationale: {
          type: 'string',
          description:
            'Why this analog should help, e.g. "carboxylic acid to tetrazole bioisostere, ' +
            'keeps acidity while lowering logP".',
        },
        predicted_mw: { type: 'number', description: 'Your predicted molecular weight, before computing.' },
        predicted_logp: { type: 'number', description: 'Your predicted cLogP, before computing.' },
        predicted_tpsa: { type: 'number', description: 'Your predicted TPSA, before computing.' },
      },
      required: ['smiles', 'rationale'],
    },
    execute: async (args: {
      smiles: string
      rationale: string
      predicted_mw?: number
      predicted_logp?: number
      predicted_tpsa?: number
    }) => {
      const prediction: Prediction = {}
      if (typeof args.predicted_mw === 'number') prediction.mw = args.predicted_mw
      if (typeof args.predicted_logp === 'number') prediction.logP = args.predicted_logp
      if (typeof args.predicted_tpsa === 'number') prediction.tpsa = args.predicted_tpsa

      const candidate = await store().addCandidate({
        smiles: args.smiles,
        rationale: args.rationale,
        prediction: Object.keys(prediction).length ? prediction : null,
        source: 'agent',
      })

      store().note({
        actor: 'agent',
        tool: 'propose_candidate',
        detail: candidate.properties.canonicalSmiles,
        ok: candidate.lipinski.passes,
      })

      return ok({
        id: candidate.id,
        measured: candidate.properties,
        lipinski: candidate.lipinski,
        scorecard: candidate.scorecard,
        note: candidate.scorecard.length
          ? 'Compare `predicted` against `actual` above and adjust your next proposal.'
          : 'You supplied no prediction. Next time include predicted_mw / predicted_logp / ' +
            'predicted_tpsa so your reasoning can be checked against the measurement.',
      })
    },
  },
]

/**
 * Registers every tool. Cleanup is via AbortController — abort the signal and
 * the tools disappear, which is also what makes StrictMode's double-mount in
 * dev harmless.
 */
export async function registerTools(signal: AbortSignal): Promise<string[]> {
  const context = document.modelContext
  if (!context) return []
  for (const tool of TOOLS) {
    await context.registerTool(tool as ToolDescriptor, { signal })
  }
  const registered = await context.getTools()
  return registered.map((t) => t.name)
}

export const TOOL_NAMES = TOOLS.map((t) => t.name)
