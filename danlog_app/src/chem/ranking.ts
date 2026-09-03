import type { Candidate, Molecule } from '../store/workbench'
import type { Properties } from './properties'
import type { Constraint } from './constraints'
import { measureFor } from './measures'

/**
 * Why a candidate is worth looking at.
 *
 * The board used to present eight candidates as eight equal rows of numbers,
 * which pushes the whole ranking job onto the human. This module does the part
 * a machine can honestly do: say which candidate leads on which axis, and by
 * how much, using only numbers already computed elsewhere.
 *
 * Nothing here invents a new measurement. Every score is a rearrangement of
 * values RDKit or the existing estimators produced, so a label can always be
 * traced back to a column in the property grid.
 */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Which way is "better" for a property, absent any instruction from the human.
 * Deliberately sparse: TPSA, logP and the CYP columns are left out because
 * there is no direction that is right regardless of what you are designing for.
 */
const INTRINSIC_DIRECTION: Partial<Record<keyof Properties, 1 | -1>> = {
  logS: 1,
  saScore: -1,
  hiaScore: 1,
  oralBioavailability: 1,
  metabolicStability: 1,
  fsp3: 1,
  mw: -1,
}

export type Delta = {
  key: keyof Properties
  label: string
  value: number
  before: number | null
  /** value - before, rounded. Null when there is nothing to compare against. */
  change: number | null
  direction: 'up' | 'down' | 'flat'
  /**
   * Whether the move is an improvement. Decided by the human's constraint when
   * one covers this property, otherwise by INTRINSIC_DIRECTION, otherwise null
   * -- which renders grey rather than pretending to an opinion.
   */
  good: boolean | null
}

/** Below this the number is noise rather than a change worth an arrow. */
const NOISE: Partial<Record<keyof Properties, number>> = {
  logS: 0.05,
  logP: 0.05,
  tpsa: 0.5,
  mw: 0.5,
  fsp3: 0.01,
  saScore: 0.1,
}

/**
 * Does moving from `before` to `value` head toward satisfying this constraint?
 * A property already inside its window is neutral -- moving around within the
 * window is not an improvement.
 */
function constraintVerdict(
  c: Constraint,
  before: number,
  value: number,
): boolean | null {
  const miss = (v: number) => {
    const under = c.min !== undefined && v < c.min ? c.min - v : 0
    const over = c.max !== undefined && v > c.max ? v - c.max : 0
    return Math.max(under, over)
  }
  const missBefore = miss(before)
  const missAfter = miss(value)
  if (missBefore === missAfter) return null
  return missAfter < missBefore
}

export function deltaFor(
  key: keyof Properties,
  candidate: Properties,
  focus: Properties | null,
  constraints: Constraint[] = [],
): Delta {
  const measure = measureFor(key)
  const value = Number(candidate[key])
  const before = focus ? Number(focus[key]) : null
  const raw = before === null ? null : value - before
  const threshold = NOISE[key] ?? 0.005
  const change = raw === null ? null : Number(raw.toFixed(2))
  const direction =
    raw === null || Math.abs(raw) < threshold ? 'flat' : raw > 0 ? 'up' : 'down'

  let good: boolean | null = null
  if (direction !== 'flat' && before !== null) {
    const constraint = constraints.find((c) => c.key === key)
    if (constraint) {
      good = constraintVerdict(constraint, before, value)
    } else {
      const intrinsic = INTRINSIC_DIRECTION[key]
      if (intrinsic) good = raw !== null && Math.sign(raw) === intrinsic
    }
  }

  return {
    key,
    label: measure?.label ?? String(key),
    value,
    before,
    change,
    direction,
    good,
  }
}

// --- scoring -----------------------------------------------------------------

export type Scores = {
  /** Weighted composite used for the default sort. 0..1. */
  overall: number
  /** logS gain over the focus molecule, in log units. 0 when there is no focus. */
  solubilityGain: number
  /** 0..1, higher means easier to make. */
  synthesis: number
  /** 0..1 from HIA. */
  absorption: number
  /** Fraction of the human's constraints this candidate satisfies. 1 when none set. */
  goals: number
  /** sp3 fraction, i.e. how three-dimensional it is. */
  threeD: number
  /** 1 - Tanimoto to the parent. 0 when there is no parent to compare to. */
  novelty: number
}

export function scoreCandidate(c: Candidate, focus: Molecule | null): Scores {
  const p = c.properties
  const solubilityGain = focus ? Number((p.logS - focus.properties.logS).toFixed(2)) : 0
  // SA 2 is comfortable, SA 7 is a problem. Linear between the two.
  const synthesis = clamp01((7 - p.saScore) / 5)
  const absorption = clamp01(p.hiaScore / 100)
  const goals = c.constraints.total === 0 ? 1 : c.constraints.satisfied / c.constraints.total
  const threeD = clamp01(p.fsp3)
  const novelty = c.similarityToParent === null ? 0 : 1 - c.similarityToParent

  const solubility = clamp01((solubilityGain + 1) / 2)
  const rules = c.rules.passes ? 1 : 0.6
  // Dropping the pinned group is not a trade-off, it is a failed brief. The
  // multiplier keeps such a candidate visible but never near the top.
  const kept = c.scaffoldOk === false ? 0.35 : 1

  const overall =
    (solubility * 0.25 + synthesis * 0.2 + absorption * 0.2 + goals * 0.25 + rules * 0.1) * kept

  return {
    overall: Number(overall.toFixed(3)),
    solubilityGain,
    synthesis: Number(synthesis.toFixed(3)),
    absorption: Number(absorption.toFixed(3)),
    goals: Number(goals.toFixed(3)),
    threeD,
    novelty: Number(novelty.toFixed(3)),
  }
}

// --- headline labels ---------------------------------------------------------

export type LabelKey = 'balance' | 'solubility' | 'threeD' | 'scaffold' | 'absorption'

export type Highlight = { text: string; tone: 'good' | 'warn' | 'neutral' }

export type Ranked = {
  candidate: Candidate
  scores: Scores
  /** 1-based position in the current sort. Displayed as 01, 02, ... */
  rank: number
  /** "Best balance" and friends, or null when nothing distinguishes it. */
  label: string | null
  labelKey: LabelKey | null
  /** One sentence saying why the label was awarded. */
  headline: string
  /** The two or three chips the card shows instead of a property dump. */
  highlights: Highlight[]
}

const LABEL_TEXT: Record<LabelKey, string> = {
  balance: 'Best balance',
  solubility: 'Best solubility',
  threeD: 'Best 3D diversity',
  scaffold: 'Alternate scaffold',
  absorption: 'Best absorption',
}

/** Chips summarising the handful of moves that actually matter on a card. */
function highlightsFor(c: Candidate, s: Scores, focus: Molecule | null): Highlight[] {
  const out: Highlight[] = []

  if (focus) {
    if (s.solubilityGain >= 0.6) out.push({ text: 'Solubility ↑↑', tone: 'good' })
    else if (s.solubilityGain >= 0.15) out.push({ text: 'Solubility ↑', tone: 'good' })
    else if (s.solubilityGain <= -0.3) out.push({ text: 'Solubility ↓', tone: 'warn' })

    const hia = c.properties.hiaScore - focus.properties.hiaScore
    if (hia >= 3) out.push({ text: 'HIA ↑', tone: 'good' })
    else if (hia <= -8) out.push({ text: 'HIA ↓', tone: 'warn' })

    if (c.properties.fsp3 - focus.properties.fsp3 >= 0.15)
      out.push({ text: 'Fsp3 ↑↑', tone: 'good' })
  }

  if (c.properties.saScore > 6.5) out.push({ text: 'High SA', tone: 'warn' })
  if (c.scaffoldOk === false) out.push({ text: 'Scaffold lost', tone: 'warn' })
  if (c.similarityToParent !== null && c.similarityToParent < 0.35)
    out.push({ text: 'New scaffold', tone: 'neutral' })

  // A candidate that is not extreme on any axis still deserves a reason to exist.
  if (out.length === 0 && s.overall >= 0.6) out.push({ text: 'Balanced', tone: 'neutral' })

  return out.slice(0, 3)
}

function headlineFor(key: LabelKey | null, s: Scores, c: Candidate): string {
  switch (key) {
    case 'balance':
      return 'Best balance of predicted solubility and synthesizability.'
    case 'solubility':
      return s.synthesis < 0.4
        ? 'Highest predicted solubility improvement, but harder to synthesize.'
        : `Largest solubility gain on the board, ${s.solubilityGain > 0 ? '+' : ''}${s.solubilityGain} log units.`
    case 'threeD':
      return 'Most three-dimensional character, which usually helps solubility and selectivity.'
    case 'scaffold':
      return 'Furthest from the parent scaffold — a genuinely different idea to test.'
    case 'absorption':
      return `Highest predicted intestinal absorption at ${c.properties.hiaScore}%.`
    default:
      return c.rationale || 'No single axis stands out; inspect for the detail.'
  }
}

export type SortKey = 'overall' | 'solubility' | 'synthesis' | 'absorption' | 'novelty' | 'newest'

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'overall', label: 'Overall score' },
  { key: 'solubility', label: 'Solubility gain' },
  { key: 'synthesis', label: 'Ease of synthesis' },
  { key: 'absorption', label: 'Absorption (HIA)' },
  { key: 'novelty', label: 'Scaffold novelty' },
  { key: 'newest', label: 'Most recent' },
]

/**
 * Score, label and order the board.
 *
 * Labels are awarded at most once each and only when the candidate genuinely
 * leads that axis by a margin worth naming -- an "everyone gets a prize" board
 * would be exactly the flat list this replaces. Rejected candidates are scored
 * but never labelled, so a discarded idea cannot hold the top badge.
 */
export function rankCandidates(
  candidates: Candidate[],
  focus: Molecule | null,
  sort: SortKey = 'overall',
): Ranked[] {
  const scored = candidates.map((candidate) => ({
    candidate,
    scores: scoreCandidate(candidate, focus),
  }))

  const contenders = scored.filter((s) => s.candidate.status !== 'rejected')
  const labels = new Map<string, LabelKey>()
  const taken = new Set<string>()

  const award = (key: LabelKey, pick: (typeof scored)[number] | undefined) => {
    if (!pick || taken.has(pick.candidate.id)) return
    labels.set(pick.candidate.id, key)
    taken.add(pick.candidate.id)
  }

  const best = (
    by: (s: (typeof scored)[number]) => number,
    qualifies: (s: (typeof scored)[number]) => boolean,
  ) => {
    const eligible = contenders.filter((s) => !taken.has(s.candidate.id) && qualifies(s))
    if (eligible.length === 0) return undefined
    return eligible.reduce((a, b) => (by(b) > by(a) ? b : a))
  }

  // Order matters: the first label claimed wins the candidate.
  award(
    'balance',
    best(
      (s) => s.scores.overall,
      (s) => s.scores.overall >= 0.5 && s.candidate.scaffoldOk !== false,
    ),
  )
  award(
    'solubility',
    best(
      (s) => s.scores.solubilityGain,
      (s) => s.scores.solubilityGain > 0.1,
    ),
  )
  award(
    'threeD',
    best(
      (s) => s.scores.threeD,
      (s) => s.scores.threeD >= 0.3 && (!focus || s.scores.threeD > focus.properties.fsp3),
    ),
  )
  award(
    'scaffold',
    best(
      (s) => s.scores.novelty,
      (s) => s.candidate.similarityToParent !== null && s.candidate.similarityToParent < 0.6,
    ),
  )
  award(
    'absorption',
    best(
      (s) => s.scores.absorption,
      (s) => s.candidate.properties.hiaScore >= 80,
    ),
  )

  const by: Record<SortKey, (s: (typeof scored)[number]) => number> = {
    overall: (s) => s.scores.overall,
    solubility: (s) => s.scores.solubilityGain,
    synthesis: (s) => s.scores.synthesis,
    absorption: (s) => s.scores.absorption,
    novelty: (s) => s.scores.novelty,
    newest: (s) => s.candidate.createdAt,
  }

  const ordered = [...scored].sort((a, b) => {
    // Rejected candidates sink regardless of how they score.
    const aDead = a.candidate.status === 'rejected' ? 1 : 0
    const bDead = b.candidate.status === 'rejected' ? 1 : 0
    if (aDead !== bDead) return aDead - bDead
    return by[sort](b) - by[sort](a)
  })

  return ordered.map((entry, i) => {
    const labelKey = labels.get(entry.candidate.id) ?? null
    return {
      ...entry,
      rank: i + 1,
      labelKey,
      label: labelKey ? LABEL_TEXT[labelKey] : null,
      headline: headlineFor(labelKey, entry.scores, entry.candidate),
      highlights: highlightsFor(entry.candidate, entry.scores, focus),
    }
  })
}

/** Two-digit rank for the card corner: 1 -> "01". */
export const rankLabel = (n: number) => String(n).padStart(2, '0')

/**
 * The human-facing state of a candidate. The stored status stays
 * pending/accepted/rejected because the WebMCP tools reason about those three;
 * this is only how it is worded on screen.
 */
export function displayStatus(c: Candidate, shortlisted: boolean): string {
  if (c.status === 'accepted') return 'Accepted'
  if (c.status === 'rejected') return 'Rejected'
  if (shortlisted) return 'Shortlisted'
  return c.source === 'agent' ? 'Generated' : 'Reviewed'
}
