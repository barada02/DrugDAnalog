import type { Properties } from './properties'
import { matchSmarts } from './substructure'

export type NumericField = 'mw' | 'logP' | 'tpsa' | 'hbd' | 'hba' | 'rotatableBonds'

export const FIELD_LABELS: Record<NumericField, string> = {
  mw: 'MW',
  logP: 'logP',
  tpsa: 'TPSA',
  hbd: 'HBD',
  hba: 'HBA',
  rotatableBonds: 'rotatable bonds',
}

/**
 * A hard requirement the human sets on the design. Candidates that break one
 * are rejected outright, with the specific constraint named -- a bare "rejected"
 * gives an agent nothing to correct.
 */
export type Constraint =
  | { id: string; kind: 'preserve'; smarts: string; label: string }
  | { id: string; kind: 'forbid'; smarts: string; label: string }
  | { id: string; kind: 'max'; field: NumericField; value: number }
  | { id: string; kind: 'min'; field: NumericField; value: number }

export type ConstraintCheck = {
  constraintId: string
  description: string
  satisfied: boolean
  detail: string
}

export type Verdict = {
  accepted: boolean
  checks: ConstraintCheck[]
  /** Just the failures, for the agent to act on without parsing the whole list. */
  failures: string[]
}

export function describeConstraint(constraint: Constraint): string {
  switch (constraint.kind) {
    case 'preserve':
      return 'must keep ' + constraint.label + ' (' + constraint.smarts + ')'
    case 'forbid':
      return 'must not contain ' + constraint.label + ' (' + constraint.smarts + ')'
    case 'max':
      return FIELD_LABELS[constraint.field] + ' at most ' + constraint.value
    case 'min':
      return FIELD_LABELS[constraint.field] + ' at least ' + constraint.value
  }
}

async function check(
  constraint: Constraint,
  smiles: string,
  properties: Properties,
): Promise<ConstraintCheck> {
  const description = describeConstraint(constraint)

  if (constraint.kind === 'preserve' || constraint.kind === 'forbid') {
    const match = await matchSmarts(smiles, constraint.smarts)
    const present = match !== null
    const satisfied = constraint.kind === 'preserve' ? present : !present
    return {
      constraintId: constraint.id,
      description,
      satisfied,
      detail: present ? constraint.label + ' is present' : constraint.label + ' is absent',
    }
  }

  const actual = properties[constraint.field]
  const satisfied = constraint.kind === 'max' ? actual <= constraint.value : actual >= constraint.value
  return {
    constraintId: constraint.id,
    description,
    satisfied,
    detail: FIELD_LABELS[constraint.field] + ' is ' + actual,
  }
}

/**
 * Checks every constraint rather than short-circuiting on the first failure:
 * an agent fixing one violation at a time needs the whole list.
 */
export async function evaluate(
  smiles: string,
  properties: Properties,
  constraints: Constraint[],
): Promise<Verdict> {
  const checks = await Promise.all(constraints.map((c) => check(c, smiles, properties)))
  const failures = checks.filter((c) => !c.satisfied)
  return {
    accepted: failures.length === 0,
    checks,
    failures: failures.map((c) => c.description + ' -- but ' + c.detail),
  }
}

/**
 * Scaffold patterns offered in the UI. These are deliberately specific: a loose
 * pattern silently passes. `CC(=O)O` matches any acyl ester including a
 * glycoloyl one, which is why the acetyl pattern pins the methyl as [CH3].
 */
export const SCAFFOLD_PRESETS: { label: string; smarts: string }[] = [
  { label: 'amide', smarts: '[CX3](=O)[NX3]' },
  { label: 'carboxylic acid', smarts: '[CX3](=O)[OX2H1]' },
  { label: 'acetyl ester', smarts: '[CH3]C(=O)O[#6]' },
  { label: 'benzene ring', smarts: 'c1ccccc1' },
  { label: 'phenol', smarts: '[OX2H]c' },
  { label: 'primary amine', smarts: '[NX3;H2;!$(NC=O)]' },
  { label: 'tetrazole', smarts: 'c1nnn[nH]1' },
]
