import type { Properties } from './properties'

/**
 * Drug-likeness rulesets. Each one is a handful of if-statements over numbers
 * we already computed -- linters for molecules.
 *
 * They are guidance, not law: plenty of marketed drugs break them. Their value
 * is that they name the specific thing that is wrong, which is what an agent
 * needs in order to fix it.
 */
export type RuleResult = {
  name: string
  /** What the rule is for, in one line. */
  about: string
  passes: boolean
  /** Every broken clause, named with its actual number. */
  violations: string[]
}

/**
 * Lipinski's rule of five -- oral absorption. The best known and the most
 * over-applied.
 */
export function lipinski(p: Properties): RuleResult {
  const violations: string[] = []
  if (p.mw > 500) violations.push(`MW ${p.mw} > 500`)
  if (p.logP > 5) violations.push(`logP ${p.logP} > 5`)
  if (p.hbd > 5) violations.push(`HBD ${p.hbd} > 5`)
  if (p.hba > 10) violations.push(`HBA ${p.hba} > 10`)
  return {
    name: 'Lipinski',
    about: 'Oral absorption. Two or more violations usually means it will not work as a pill.',
    passes: violations.length === 0,
    violations,
  }
}

/** Veber -- oral bioavailability, and better at it than Lipinski. */
export function veber(p: Properties): RuleResult {
  const violations: string[] = []
  if (p.rotatableBonds > 10) violations.push(`rotatable bonds ${p.rotatableBonds} > 10`)
  if (p.tpsa > 140) violations.push(`TPSA ${p.tpsa} > 140`)
  return {
    name: 'Veber',
    about: 'Oral bioavailability. Too floppy or too polar and it will not cross the gut wall.',
    passes: violations.length === 0,
    violations,
  }
}

/** Egan -- passive absorption, drawn as an ellipse in logP/TPSA space. */
export function egan(p: Properties): RuleResult {
  const violations: string[] = []
  if (p.logP > 5.88) violations.push(`logP ${p.logP} > 5.88`)
  if (p.tpsa > 131.6) violations.push(`TPSA ${p.tpsa} > 131.6`)
  return {
    name: 'Egan',
    about: 'Passive absorption through the gut wall.',
    passes: violations.length === 0,
    violations,
  }
}

/**
 * Pfizer 3/75 -- a toxicity risk flag rather than an absorption rule.
 * Greasy AND non-polar together correlates with in-vivo toxicity, so unlike the
 * others this fails only when BOTH clauses are true.
 */
export function pfizer3x75(p: Properties): RuleResult {
  const risky = p.logP > 3 && p.tpsa < 75
  return {
    name: 'Pfizer 3/75',
    about: 'Toxicity risk. Greasy and non-polar at the same time is the dangerous combination.',
    passes: !risky,
    violations: risky ? [`logP ${p.logP} > 3 together with TPSA ${p.tpsa} < 75`] : [],
  }
}

export type RuleReport = {
  rules: RuleResult[]
  /** Only the rules that broke. Empty when everything passes. */
  failed: RuleResult[]
  passes: boolean
  /** Every broken clause across every ruleset, flattened for compact display. */
  violations: string[]
}

export function assess(p: Properties): RuleReport {
  const rules = [lipinski(p), veber(p), egan(p), pfizer3x75(p)]
  const failed = rules.filter((r) => !r.passes)
  return {
    rules,
    failed,
    passes: failed.length === 0,
    violations: failed.flatMap((r) => r.violations),
  }
}
