import type { Properties } from './properties'

/**
 * The human's own objective, made checkable.
 *
 * Real lead optimisation fails because fixing one property breaks another, and
 * the agent needs something to optimise against that is not a vibe. This is
 * deliberately NOT a published drug-likeness score: it is whatever the human
 * said they wanted, scored honestly.
 *
 * That distinction matters. We could not ship QED without the structural alert
 * list it depends on, and inventing our own composite score would have been
 * the same false authority wearing a different hat. A constraint the human
 * typed carries no such claim.
 */
export type Constraint = {
  key: keyof Properties
  label: string
  min?: number
  max?: number
}

export type ConstraintCheck = Constraint & {
  value: number
  satisfied: boolean
  /** How far outside, in the property's own units. Zero when satisfied. */
  miss: number
  message: string
}

export type ConstraintReport = {
  checks: ConstraintCheck[]
  satisfied: number
  total: number
  allMet: boolean
}

const format = (c: Constraint): string => {
  if (c.min !== undefined && c.max !== undefined) return `${c.min} to ${c.max}`
  if (c.min !== undefined) return `at least ${c.min}`
  if (c.max !== undefined) return `at most ${c.max}`
  return 'any'
}

export function describeConstraint(c: Constraint): string {
  return `${c.label} ${format(c)}`
}

export function checkConstraints(
  properties: Properties,
  constraints: Constraint[],
): ConstraintReport {
  const checks = constraints.map((c) => {
    const value = Number(properties[c.key])
    const under = c.min !== undefined && value < c.min ? c.min - value : 0
    const over = c.max !== undefined && value > c.max ? value - c.max : 0
    const miss = Number(Math.max(under, over).toFixed(2))
    const satisfied = miss === 0
    return {
      ...c,
      value,
      satisfied,
      miss,
      message: satisfied
        ? `${c.label} ${value} is within ${format(c)}.`
        : `${c.label} ${value} misses ${format(c)} by ${miss}.`,
    }
  })

  const satisfied = checks.filter((c) => c.satisfied).length
  return { checks, satisfied, total: checks.length, allMet: satisfied === checks.length }
}

/** Sensible starting constraints, so the feature is usable without typing. */
export const CONSTRAINT_PRESETS: { name: string; constraints: Constraint[] }[] = [
  {
    name: 'Oral drug',
    constraints: [
      { key: 'mw', label: 'MW', max: 500 },
      { key: 'logP', label: 'logP', min: 0, max: 5 },
      { key: 'tpsa', label: 'TPSA', max: 140 },
      { key: 'rotatableBonds', label: 'RotB', max: 10 },
    ],
  },
  {
    name: 'More soluble',
    constraints: [
      { key: 'logS', label: 'logS', min: -3 },
      { key: 'logP', label: 'logP', max: 3 },
      { key: 'tpsa', label: 'TPSA', min: 60 },
    ],
  },
  {
    name: 'Lead-like',
    constraints: [
      { key: 'mw', label: 'MW', min: 200, max: 350 },
      { key: 'logP', label: 'logP', min: 0, max: 3 },
      { key: 'rotatableBonds', label: 'RotB', max: 7 },
    ],
  },
  {
    name: 'Brain penetrant',
    constraints: [
      { key: 'mw', label: 'MW', max: 450 },
      { key: 'tpsa', label: 'TPSA', max: 90 },
      { key: 'logP', label: 'logP', min: 1, max: 4 },
      { key: 'hbd', label: 'HBD', max: 3 },
    ],
  },
  {
    name: 'Metabolically stable',
    constraints: [
      { key: 'metabolicStability', label: 'Met. Stability', min: 60 },
      { key: 'oralBioavailability', label: 'F%', min: 40 },
    ],
  },
]
