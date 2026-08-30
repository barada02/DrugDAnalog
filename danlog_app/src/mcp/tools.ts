import { describeConstraint } from '../chem/constraints'
import { computeProperties, lipinski } from '../chem/properties'
import { countMatches, matchSmarts } from '../chem/substructure'
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
      const { goal, constraints, focus, candidates } = store()
      return ok({
        goal: goal || null,
        constraints: constraints.map(describeConstraint),
        focus: focus && { ...focus.properties, lipinski: focus.lipinski },
        candidates: candidates.map((c) => ({
          id: c.id,
          smiles: c.properties.canonicalSmiles,
          source: c.source,
          status: c.verdict.accepted ? 'accepted' : 'rejected',
          rejectedFor: c.verdict.failures,
          rationale: c.rationale,
          properties: c.properties,
          lipinski: c.lipinski,
          scorecard: c.scorecard,
        })),
      })
    },
  },
  {
    name: 'get_design_goal',
    description:
      'Read what the human is actually trying to make: the stated goal in their own words, ' +
      'plus the hard constraints every candidate is checked against. Constraints are not ' +
      'advisory. A candidate that breaks one is rejected no matter how good its properties ' +
      'are, so read this before designing anything.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: () => {
      const { goal, constraints } = store()
      return ok({
        goal: goal || null,
        constraints: constraints.map((c) => ({ id: c.id, requirement: describeConstraint(c) })),
        note: constraints.length
          ? 'Every candidate is checked against all of these.'
          : 'No hard constraints set. Only the stated goal applies.',
      })
    },
  },
  {
    name: 'check_substructure',
    description:
      'Test whether a molecule contains a substructure, using real RDKit graph matching. ' +
      'Use it to check your own work before proposing: whether an edit actually preserved ' +
      'the scaffold you claim it preserved, or whether a group you meant to replace is ' +
      'really gone. Reading a SMILES string is not the same as matching it.',
    inputSchema: {
      type: 'object',
      properties: {
        smiles: SMILES_PARAM,
        smarts: {
          type: 'string',
          description:
            'SMARTS pattern to look for, e.g. [CX3](=O)[NX3] for an amide. Be specific: a ' +
            'loose pattern matches things you did not mean, so CC(=O)O matches any acyl ' +
            'ester rather than only an acetyl one.',
        },
      },
      required: ['smiles', 'smarts'],
    },
    annotations: { readOnlyHint: true },
    execute: async ({ smiles, smarts }: { smiles: string; smarts: string }) => {
      const atoms = await matchSmarts(smiles, smarts)
      const count = atoms ? await countMatches(smiles, smarts) : 0
      store().note({ actor: 'agent', tool: 'check_substructure', detail: smarts, ok: atoms !== null })
      return ok({
        smiles,
        smarts,
        present: atoms !== null,
        matchCount: count,
        matchedAtoms: atoms,
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
      'Add a candidate analog to the design board and get its real computed properties back, ' +
      'along with a verdict on the human hard constraints. A candidate that breaks a ' +
      'constraint is REJECTED and the tool names which one and why: fix that specific ' +
      'violation and propose again. State your predicted mw, logP and tpsa first, and the ' +
      'tool also scores those against what RDKit measures. Call get_design_goal before your ' +
      'first proposal so you know the rules you are being judged against.',
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
        ok: candidate.verdict.accepted,
      })

      const notes: string[] = []
      if (!candidate.verdict.accepted) {
        notes.push(
          'REJECTED. Fix the constraint violations listed in rejectedFor and propose a ' +
            'corrected analog. Use check_substructure to confirm the fix before proposing.',
        )
      }
      if (!candidate.lipinski.passes) {
        notes.push('Lipinski violations: ' + candidate.lipinski.violations.join('; '))
      }
      notes.push(
        candidate.scorecard.length
          ? 'Compare predicted against actual in the scorecard and adjust your next estimate.'
          : 'You supplied no prediction. Next time include predicted_mw / predicted_logp / ' +
            'predicted_tpsa so your reasoning can be checked against the measurement.',
      )

      return ok({
        id: candidate.id,
        status: candidate.verdict.accepted ? 'accepted' : 'rejected',
        rejectedFor: candidate.verdict.failures,
        constraintChecks: candidate.verdict.checks.map((c) => ({
          requirement: c.description,
          satisfied: c.satisfied,
          detail: c.detail,
        })),
        measured: candidate.properties,
        lipinski: candidate.lipinski,
        scorecard: candidate.scorecard,
        note: notes.join(' '),
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
