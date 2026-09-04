import type { Candidate } from '../store/workbench'
import { generationMap } from './ranking'

/**
 * How close the board is getting to the brief.
 *
 * Shared between Overview and Evolution deliberately. Two pages each computing
 * "are we winning" their own way is two pages that will eventually disagree,
 * and the answer is the same question in both places.
 */

/** Anything with a constraint report and a rule report can be scored. */
type Judgeable = {
  constraints: Candidate['constraints']
  rules: Candidate['rules']
}

/**
 * A molecule's standing against the brief, 0..1.
 *
 * Falls back to the rulesets when no target profile is set, because a
 * satisfied-count over zero constraints is not 100% -- it is undefined, and
 * drawing it as success would flatter the board.
 */
export function briefRatio(m: Judgeable, usingGoals: boolean): number | null {
  if (usingGoals) {
    return m.constraints.total === 0 ? null : m.constraints.satisfied / m.constraints.total
  }
  const total = m.rules.rules.length
  return total === 0 ? null : m.rules.rules.filter((r) => r.passes).length / total
}

export type Progress = {
  labels: string[]
  /** Best a generation managed, ignoring anything rejected. */
  best: (number | null)[]
  /** What the generation's promoted molecule managed, where there was one. */
  promoted: (number | null)[]
  /** Which measure the numbers are, so the caller can label it honestly. */
  measuring: 'goals' | 'rules'
  /** Best on the board right now, and in the first generation, for the summary. */
  latest: number | null
  first: number | null
}

export function briefProgress({
  candidates,
  promotedIds,
  usingGoals,
  origin,
}: {
  candidates: Candidate[]
  promotedIds: Set<string>
  usingGoals: boolean
  /** Prepended as "Start" when known. Omitted rather than faked when not. */
  origin?: Judgeable | null
}): Progress {
  const depth = generationMap(candidates)
  const maxDepth = candidates.length
    ? Math.max(...candidates.map((c) => depth.get(c.id) ?? 1))
    : 0

  const labels: string[] = []
  const best: (number | null)[] = []
  const promoted: (number | null)[] = []

  if (origin) {
    labels.push('Start')
    const r = briefRatio(origin, usingGoals)
    best.push(r)
    promoted.push(r)
  }

  for (let d = 1; d <= maxDepth; d++) {
    const members = candidates.filter((c) => depth.get(c.id) === d)
    if (members.length === 0) continue
    labels.push(`Gen ${d}`)

    const alive = members
      .filter((c) => c.status !== 'rejected')
      .map((c) => briefRatio(c, usingGoals))
      .filter((r): r is number => r !== null)
    best.push(alive.length ? Math.max(...alive) : null)

    const step = members.find((c) => promotedIds.has(c.id))
    promoted.push(step ? briefRatio(step, usingGoals) : null)
  }

  const measured = best.filter((b): b is number => b !== null)

  return {
    labels,
    best,
    promoted,
    measuring: usingGoals ? 'goals' : 'rules',
    latest: measured.length ? measured[measured.length - 1] : null,
    first: measured.length ? measured[0] : null,
  }
}
