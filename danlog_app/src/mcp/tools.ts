import { canonicalize, computeProperties } from '../chem/properties'
import { MEASURES, NOT_COMPUTABLE, TIER_ABOUT } from '../chem/measures'
import { assess } from '../chem/rules'
import { buildLedger, ledgerNote } from '../chem/ledger'
import { band, diversity, tanimoto } from '../chem/similarity'
import { profile, suggestionsFor } from '../chem/profile'
import { describeConstraint } from '../chem/constraints'
import { InvalidSmartsError, InvalidSmilesError } from '../chem/rdkit'
import { matchPattern } from '../chem/substructure'
import { useWorkbench } from '../store/workbench'
import type { Properties } from '../chem/properties'
import type { Candidate, Prediction } from '../store/workbench'
import type { ToolDescriptor, ToolResult } from './webmcp'

const ok = (payload: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
})

type FailCode =
  | 'INVALID_SMILES'
  | 'INVALID_SMARTS'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'NEEDS_APPROVAL'
  | 'NO_SCAFFOLD'
  | 'RDKIT_NOT_READY'

/**
 * A failure the caller can actually do something about.
 *
 * We do not own the model on the other end of these tools, so the response
 * text is the only steering we have. Every failure therefore carries a `hint`
 * saying what to do next, not just a complaint about what went wrong.
 */
const fail = (
  code: FailCode,
  message: string,
  hint: string,
  extra: Record<string, unknown> = {},
): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify({ ok: false, code, message, hint, ...extra }, null, 2) }],
  isError: true,
})

const store = () => useWorkbench.getState()

/**
 * Turns thrown exceptions into structured failures. An agent that receives a
 * stack trace is stuck; one that receives a code and a hint fixes itself and
 * retries, which is the entire point.
 */
function guarded<A>(
  tool: string,
  fn: (args: A) => Promise<ToolResult> | ToolResult,
): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    if (store().rdkitStatus !== 'ready') {
      return fail(
        'RDKIT_NOT_READY',
        'The chemistry engine has not finished loading in the page yet.',
        'Wait a moment and call this tool again.',
      )
    }
    try {
      return await fn(args)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      store().note({ actor: 'agent', tool, detail, ok: false })

      if (error instanceof InvalidSmilesError) {
        return fail(
          'INVALID_SMILES',
          detail,
          'Check that every ring-opening digit has a matching closing digit, that ' +
            'brackets are balanced, and that no atom exceeds its normal valence. ' +
            'Rewrite the SMILES and try again.',
        )
      }
      if (error instanceof InvalidSmartsError) {
        return fail(
          'INVALID_SMARTS',
          detail,
          'SMARTS is a query language, not a molecule. A carboxylic acid is ' +
            '[CX3](=[OX1])[OX2H1], for example. Correct the pattern and try again.',
        )
      }
      throw error
    }
  }
}

/** The scaffold verdict, phrased as an instruction rather than a data field. */
function scaffoldBlock(kept: boolean | null) {
  const { scaffold } = store()
  if (!scaffold || kept === null) return null
  return {
    label: scaffold.label,
    required: scaffold.smarts,
    preserved: kept,
    message: kept
      ? `The ${scaffold.label} is intact in this molecule.`
      : `FAILED THE SCAFFOLD CHECK. The human pinned the ${scaffold.label} and this ` +
        `molecule does not contain one. The card is flagged on the board. Do not ` +
        `propose this structure again -- revise it so the ${scaffold.label} survives, ` +
        `then propose the corrected SMILES.`,
  }
}

/**
 * Things worth saying out loud about a structure, regardless of its numbers.
 */
function warnings(p: Properties): string[] {
  const out: string[] = []
  if (p.undefinedStereocentres > 0) {
    const n = p.undefinedStereocentres
    out.push(
      `This SMILES leaves ${n} stereocentre${n > 1 ? 's' : ''} undefined, so it describes ` +
        `${2 ** n} different compounds rather than one. Every property below is computed ` +
        'without stereochemistry. If the design depends on a specific isomer, say which.',
    )
  }
  return out
}

/**
 * Every number with its confidence tier attached.
 *
 * This is the honesty layer. An agent will otherwise report molecular weight
 * and estimated solubility with identical certainty, when one is addition and
 * the other is a regression with a log unit of error. Attaching the tier tells
 * it what it is allowed to claim.
 */
function describe(p: Properties) {
  const confidence: Record<string, unknown> = {}
  for (const measure of MEASURES) {
    confidence[measure.key] = {
      value: p[measure.key],
      tier: measure.tier,
      ...(measure.error === undefined ? {} : { plusMinus: measure.error }),
      ...(measure.unit === undefined ? {} : { unit: measure.unit }),
      about: measure.about,
    }
  }
  return {
    smiles: p.canonicalSmiles,
    properties: p,
    confidence,
    tierMeanings: TIER_ABOUT,
    rules: assess(p),
    warnings: warnings(p),
    note:
      'Report each value with its tier. An `estimated` value must be quoted with its ' +
      'error, e.g. "logS about -2.0, plus or minus 1". Never present an estimate as a ' +
      'measurement.',
  }
}

const summarise = (c: Candidate) => ({
  id: c.id,
  smiles: c.properties.canonicalSmiles,
  status: c.status,
  source: c.source,
  rationale: c.rationale,
  properties: c.properties,
  rules: c.rules,
  scaffoldPreserved: c.scaffoldOk,
  scorecard: c.scorecard,
})

const SMILES_PARAM = {
  type: 'string',
  description: 'A SMILES string, e.g. CC(=O)Oc1ccccc1C(=O)O for aspirin.',
} as const

const TOOLS: ToolDescriptor[] = [
  {
    name: 'get_workbench_state',
    description:
      'Read the whole workbench: the design goal, the group the human pinned to be ' +
      'preserved, the focus molecule with its computed properties, and every candidate ' +
      'grouped by whether the human has accepted it, rejected it, or not decided yet. ' +
      'Call this before proposing anything, and again after, because the human changes ' +
      'the board while you work.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: guarded('get_workbench_state', () => {
      const { goal, scaffold, focus, candidates } = store()
      const byStatus = (status: Candidate['status']) =>
        candidates.filter((c) => c.status === status).map(summarise)

      return ok({
        goal: goal || null,
        preserveGroup: scaffold && {
          label: scaffold.label,
          smarts: scaffold.smarts,
          about: scaffold.about,
          rule: `Every candidate you propose must still contain the ${scaffold.label}. ` +
            'Proposals that lose it are flagged and will not be accepted.',
        },
        focus: focus && {
          ...focus.properties,
          rules: focus.rules,
          scaffoldPreserved: focus.scaffoldMatch?.matched ?? null,
        },
        candidates: {
          pending: byStatus('pending'),
          accepted: byStatus('accepted'),
          rejected: byStatus('rejected'),
        },
        constraints: store().constraints.length
          ? {
              required: store().constraints.map(describeConstraint),
              focusMeets: focus ? `${focus.constraints.satisfied}/${focus.constraints.total}` : null,
              rule:
                'These are the objectives the human stated. A proposal that satisfies more ' +
                'of them is better, and one that satisfies all of them is what you are ' +
                'aiming for. Optimise against every constraint at once, not one at a time.',
            }
          : null,
        predictionAccuracy: { ...buildLedger(candidates), advice: ledgerNote(buildLedger(candidates)) },
        boardDiversity: diversity(
          candidates.filter((c) => c.status !== 'rejected').map((c) => c.fp),
        ),
        note:
          'Only the human can move a candidate out of `pending`. Do not treat a pending ' +
          'candidate as approved. `boardDiversity` near 0 means you are proposing ' +
          'variations on one idea rather than distinct ideas.',
      })
    }),
  },

  {
    name: 'get_molecule_properties',
    description:
      'Compute real molecular properties for a SMILES string with RDKit: molecular weight, ' +
      'cLogP, TPSA, hydrogen bond donors and acceptors, rotatable bonds, aromatic rings, ' +
      'Fsp3, undefined stereocentres, and an estimated aqueous solubility. Also returns ' +
      'verdicts for Lipinski, Veber, Egan and Pfizer 3/75, each naming the exact clause ' +
      'that broke. Every value comes back with a confidence tier saying whether it was ' +
      'counted exactly, computed by an algorithm, or estimated by a regression with a ' +
      'stated error. Never state a property value you have not obtained from this tool, ' +
      'and never quote an estimated value without its error.',
    inputSchema: {
      type: 'object',
      properties: { smiles: SMILES_PARAM },
      required: ['smiles'],
    },
    annotations: { readOnlyHint: true },
    execute: guarded('get_molecule_properties', async ({ smiles }: { smiles: string }) => {
      const properties = await computeProperties(smiles)
      store().note({ actor: 'agent', tool: 'get_molecule_properties', detail: smiles, ok: true })
      return ok(describe(properties))
    }),
  },

  {
    name: 'check_substructure',
    description:
      'Ask whether a molecule contains a particular group, before you commit to proposing ' +
      'it. With no pattern argument this checks the group the human pinned to be preserved, ' +
      'which is the check that decides whether a proposal is acceptable at all. Use this to ' +
      'screen your own ideas: verify the group survived, and discard the ones that lost it ' +
      'instead of showing them to the human.',
    inputSchema: {
      type: 'object',
      properties: {
        smiles: SMILES_PARAM,
        pattern: {
          type: 'string',
          description:
            'Optional SMARTS pattern to look for. Omit this to check the group the human ' +
            'pinned. SMARTS examples: [NX3][CX3](=[OX1]) is an amide, ' +
            '[CX3](=[OX1])[OX2H1] is a carboxylic acid, c1ccccc1 is a benzene ring.',
        },
      },
      required: ['smiles'],
    },
    annotations: { readOnlyHint: true },
    execute: guarded(
      'check_substructure',
      async ({ smiles, pattern }: { smiles: string; pattern?: string }) => {
        const { scaffold } = store()
        const smarts = pattern ?? scaffold?.smarts
        if (!smarts) {
          return fail(
            'NO_SCAFFOLD',
            'No pattern was given and the human has not pinned a group to preserve.',
            'Pass an explicit `pattern` argument, or call get_workbench_state to see ' +
              'whether a group has been pinned since.',
          )
        }

        const label = pattern ? smarts : (scaffold?.label ?? smarts)
        const match = await matchPattern(smiles, smarts)
        store().note({
          actor: 'agent',
          tool: 'check_substructure',
          detail: `${label} in ${smiles}`,
          ok: match.matched,
        })

        return ok({
          smiles,
          pattern: smarts,
          label,
          matched: match.matched,
          occurrences: match.count,
          atoms: match.atoms,
          message: match.matched
            ? `Found the ${label}${match.count > 1 ? ` (${match.count} times)` : ''}.`
            : `This molecule does NOT contain the ${label}. If the design requires it, ` +
              'revise the structure before proposing it.',
        })
      },
    ),
  },

  {
    name: 'propose_candidate',
    description:
      'Add a candidate analog to the design board and get its real computed properties back. ' +
      'State your predicted mw, logP and tpsa first: the tool scores your prediction against ' +
      'what RDKit actually measures and returns the error on each. Use that feedback to ' +
      'correct yourself before proposing the next analog. If the human pinned a group to ' +
      'preserve, the response also tells you whether this molecule still contains it. The ' +
      'candidate lands as PENDING — only the human can accept it.',
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
    execute: guarded(
      'propose_candidate',
      async (args: {
        smiles: string
        rationale: string
        predicted_mw?: number
        predicted_logp?: number
        predicted_tpsa?: number
      }) => {
        // Canonicalise first: it validates the SMILES and gives us the only
        // reliable basis for saying two proposals are the same molecule.
        const canonical = await canonicalize(args.smiles)

        const { candidates, focus } = store()
        const clash = candidates.find((c) => c.properties.canonicalSmiles === canonical)
        if (clash) {
          return fail(
            'DUPLICATE',
            `That molecule is already on the board as candidate ${clash.id} (${clash.status}).`,
            'Propose a structurally different analog. Call get_workbench_state to see ' +
              'what has already been tried.',
            { existingId: clash.id, existingStatus: clash.status, smiles: canonical },
          )
        }
        if (focus && focus.properties.canonicalSmiles === canonical) {
          return fail(
            'DUPLICATE',
            'That is the focus molecule itself, unchanged.',
            'Propose a modified structure, not the starting molecule.',
            { smiles: canonical },
          )
        }

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

        const scaffold = scaffoldBlock(candidate.scaffoldOk)
        store().note({
          actor: 'agent',
          tool: 'propose_candidate',
          detail: candidate.properties.canonicalSmiles,
          ok: candidate.rules.passes && candidate.scaffoldOk !== false,
        })

        const drift =
          candidate.similarityToParent === null
            ? null
            : {
                tanimotoToParent: candidate.similarityToParent,
                band: band(candidate.similarityToParent),
                message:
                  candidate.similarityToParent < 0.35
                    ? 'This shares little structure with the molecule it came from. If you ' +
                      'described it as a small modification, it is not one.'
                    : 'A recognisable analog of the parent molecule.',
              }

        const constraintBlock = candidate.constraints.total
          ? {
              met: `${candidate.constraints.satisfied}/${candidate.constraints.total}`,
              allMet: candidate.constraints.allMet,
              detail: candidate.constraints.checks.map((c) => c.message),
            }
          : null

        return ok({
          id: candidate.id,
          status: candidate.status,
          similarity: drift,
          constraints: constraintBlock,
          alerts: candidate.profile.alerts.length
            ? {
                hits: candidate.profile.alerts,
                message:
                  'This molecule carries structural alerts. Report them to the human ' +
                  'rather than presenting the numbers alone.',
              }
            : null,
          measured: describe(candidate.properties),
          rules: candidate.rules,
          scaffold,
          scorecard: candidate.scorecard,
          note: candidate.scorecard.length
            ? 'Compare `predicted` against `actual` above and adjust your next proposal.'
            : 'You supplied no prediction. Next time include predicted_mw / predicted_logp / ' +
              'predicted_tpsa so your reasoning can be checked against the measurement.',
          approval:
            'This candidate is PENDING. The human decides whether it is accepted. ' +
            'Do not describe it as approved or selected.',
        })
      },
    ),
  },

  {
    name: 'analyse_structure',
    description:
      'Name the functional groups in a molecule and flag structural alerts -- reactive or ' +
      'assay-interfering groups that make a compound undevelopable however good its ' +
      'numbers look. Call this before proposing anything with unusual chemistry. A ' +
      'molecule can pass every property rule and still be unusable because it contains ' +
      'an epoxide or a catechol.',
    inputSchema: {
      type: 'object',
      properties: { smiles: SMILES_PARAM },
      required: ['smiles'],
    },
    annotations: { readOnlyHint: true },
    execute: guarded('analyse_structure', async ({ smiles }: { smiles: string }) => {
      const found = await profile(smiles)
      store().note({
        actor: 'agent',
        tool: 'analyse_structure',
        detail: `${found.groups.length} groups, ${found.alerts.length} alerts`,
        ok: found.alerts.length === 0,
      })
      return ok({
        smiles,
        functionalGroups: found.groups,
        alerts: found.alerts,
        verdict: found.alerts.length
          ? `Carries ${found.alerts.length} structural alert(s). Say so plainly rather ` +
            'than presenting this as a clean molecule.'
          : 'No structural alerts from the shipped set.',
        caveat:
          'The alert set here is a small, verified list of well-established liabilities. ' +
          'It is NOT the full PAINS, Brenk or NIH catalog, so a clean result means ' +
          'nothing matched these patterns, not that the molecule is known to be safe.',
      })
    }),
  },

  {
    name: 'suggest_bioisosteres',
    description:
      'Given a molecule, list known replacements for the functional groups it actually ' +
      'contains, with the usual direction each change moves properties. This app cannot ' +
      'apply a transformation -- YOU write the new SMILES using these suggestions, then ' +
      'call propose_candidate so the real numbers get computed. The direction given here ' +
      'is a rule of thumb, never a value: only computing the modified molecule tells you ' +
      'what actually happened.',
    inputSchema: {
      type: 'object',
      properties: { smiles: SMILES_PARAM },
      required: ['smiles'],
    },
    annotations: { readOnlyHint: true },
    execute: guarded('suggest_bioisosteres', async ({ smiles }: { smiles: string }) => {
      const found = await profile(smiles)
      const suggestions = suggestionsFor(found.groups)
      store().note({
        actor: 'agent',
        tool: 'suggest_bioisosteres',
        detail: `${suggestions.length} for ${found.groups.length} groups`,
        ok: suggestions.length > 0,
      })
      if (suggestions.length === 0) {
        return ok({
          groupsPresent: found.groups.map((g) => g.label),
          suggestions: [],
          note:
            'No catalogued replacements for the groups in this molecule. Modify ring ' +
            'systems or substituents directly instead, and let propose_candidate measure ' +
            'the result.',
        })
      }
      return ok({
        groupsPresent: found.groups.map((g) => g.label),
        suggestions,
        note:
          'Pick a replacement, write the modified SMILES yourself, and propose it. The ' +
          '`effect` field is a direction of travel, not a prediction -- state your own ' +
          'predicted values when you propose so they can be checked.',
      })
    }),
  },

  {
    name: 'compare_molecules',
    description:
      'Put candidates side by side in one property table, so you can answer which has ' +
      'the best balance without calling get_molecule_properties once per molecule. Pass ' +
      'candidate ids from get_workbench_state, or omit them to compare everything on the ' +
      'board that has not been rejected. Also returns how similar each one is to the ' +
      'focus molecule and the range across each property.',
    inputSchema: {
      type: 'object',
      properties: {
        candidate_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Candidate ids to compare. Omit to use every candidate that is not rejected.',
        },
      },
    },
    annotations: { readOnlyHint: true },
    execute: guarded('compare_molecules', ({ candidate_ids }: { candidate_ids?: string[] }) => {
      const { candidates, focus } = store()
      const chosen = candidate_ids?.length
        ? candidate_ids
            .map((wanted) => candidates.find((c) => c.id === wanted))
            .filter((c): c is Candidate => c !== undefined)
        : candidates.filter((c) => c.status !== 'rejected')

      if (chosen.length === 0) {
        return fail(
          'NOT_FOUND',
          candidate_ids?.length
            ? 'None of those ids are on the board.'
            : 'There is nothing on the board to compare yet.',
          'Call get_workbench_state for current candidate ids, or propose candidates first.',
        )
      }

      const rows = chosen.map((c) => ({
        id: c.id,
        smiles: c.properties.canonicalSmiles,
        status: c.status,
        mw: c.properties.mw,
        logP: c.properties.logP,
        tpsa: c.properties.tpsa,
        logS: c.properties.logS,
        fsp3: c.properties.fsp3,
        rulesPass: c.rules.passes,
        violations: c.rules.violations,
        scaffoldPreserved: c.scaffoldOk,
        similarityToFocus: focus ? tanimoto(c.fp, focus.fp) : null,
      }))

      const spread = (key: 'mw' | 'logP' | 'tpsa' | 'logS') => {
        const values = rows.map((r) => r[key])
        return { min: Math.min(...values), max: Math.max(...values) }
      }

      store().note({
        actor: 'agent',
        tool: 'compare_molecules',
        detail: `${rows.length} candidates`,
        ok: true,
      })

      return ok({
        rows,
        ranges: { mw: spread('mw'), logP: spread('logP'), tpsa: spread('tpsa'), logS: spread('logS') },
        diversity: diversity(chosen.map((c) => c.fp)),
        note:
          'logS is estimated with about one log unit of error, so a difference under 1 ' +
          'is not a real difference. Do not rank candidates on it alone.',
      })
    }),
  },

  {
    name: 'get_computable_limits',
    description:
      'List what this workbench can and cannot compute, and why. Call this before ' +
      'answering any question about potency, binding affinity, toxicity, pKa or synthesis ' +
      'routes. These are not available from structure alone, this app will not estimate ' +
      'them, and you should not either -- say they are unknown instead of producing a ' +
      'plausible number.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: guarded('get_computable_limits', () =>
      ok({
        computable: MEASURES.map((m) => ({
          property: m.key,
          label: m.label,
          tier: m.tier,
          ...(m.error === undefined ? {} : { plusMinus: m.error }),
          about: m.about,
        })),
        tierMeanings: TIER_ABOUT,
        rulesets: ['Lipinski', 'Veber', 'Egan', 'Pfizer 3/75'],
        notComputable: NOT_COMPUTABLE,
        note:
          'If the human asks for something in notComputable, tell them it cannot be ' +
          'determined here and say what would be needed. Do not substitute a guess.',
      }),
    ),
  },

  {
    name: 'set_focus_molecule',
    description:
      'Make a candidate the new focus molecule, so further analogs are designed from it. ' +
      'This only works on a candidate the human has ACCEPTED. A pending candidate cannot ' +
      'be promoted no matter how good its numbers are — that decision belongs to the human, ' +
      'and this tool will refuse.',
    inputSchema: {
      type: 'object',
      properties: {
        candidate_id: {
          type: 'string',
          description: 'The id of a candidate on the board, as returned by get_workbench_state.',
        },
      },
      required: ['candidate_id'],
    },
    annotations: { destructiveHint: true },
    execute: guarded('set_focus_molecule', async ({ candidate_id }: { candidate_id: string }) => {
      const candidate = store().candidates.find((c) => c.id === candidate_id)
      if (!candidate) {
        return fail(
          'NOT_FOUND',
          `No candidate on the board has the id ${candidate_id}.`,
          'Call get_workbench_state to get current candidate ids.',
        )
      }
      if (candidate.status === 'rejected') {
        return fail(
          'NEEDS_APPROVAL',
          'The human rejected that candidate, so it cannot become the focus molecule.',
          'Choose a candidate from the `accepted` group instead, or propose something new.',
          { candidateId: candidate.id, status: candidate.status },
        )
      }
      if (candidate.status !== 'accepted') {
        return fail(
          'NEEDS_APPROVAL',
          'That candidate is still pending. The human has to accept it before it can ' +
            'become the focus molecule.',
          'Leave it on the board and tell the human why you think it is worth accepting. ' +
            'Do not retry this call until get_workbench_state reports it as accepted.',
          { candidateId: candidate.id, status: candidate.status },
        )
      }

      const molecule = await store().promote(candidate.id)
      store().note({
        actor: 'agent',
        tool: 'set_focus_molecule',
        detail: molecule.properties.canonicalSmiles,
        ok: true,
      })
      return ok({
        focus: {
          ...molecule.properties,
          rules: molecule.rules,
          scaffoldPreserved: molecule.scaffoldMatch?.matched ?? null,
        },
        message: 'Focus molecule updated. Further analogs should be derived from this structure.',
      })
    }),
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
