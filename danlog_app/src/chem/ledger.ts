import type { Candidate, Prediction, ScoreRow } from '../store/workbench'

/**
 * The accuracy ledger: a running record of how often the agent's stated
 * expectations matched what RDKit actually measured.
 *
 * This is evidence rather than opinion, and it is produced as a side effect of
 * doing the real work. Nothing else in the app is as hard to argue with.
 */

/** Tolerances above which a prediction counts as wrong. Mirrors the store. */
export const TOLERANCE: Record<keyof Prediction, number> = { mw: 5, logP: 0.5, tpsa: 5 }

export type FieldAccuracy = {
  field: keyof Prediction
  label: string
  /** How many times the agent committed to a number for this property. */
  attempts: number
  within: number
  meanAbsError: number
  /** Signed mean: consistently positive or negative reveals a systematic bias. */
  bias: number
  worst: number
}

export type Ledger = {
  fields: FieldAccuracy[]
  attempts: number
  within: number
  /** Null rather than 0 when nothing has been predicted yet. */
  hitRate: number | null
}

const LABEL: Record<keyof Prediction, string> = { mw: 'MW', logP: 'logP', tpsa: 'TPSA' }

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export function buildLedger(candidates: Candidate[]): Ledger {
  const rows: ScoreRow[] = candidates.flatMap((c) => c.scorecard)

  const fields = (Object.keys(TOLERANCE) as (keyof Prediction)[])
    .map((field) => {
      const forField = rows.filter((r) => r.field === field)
      if (forField.length === 0) return null
      const errors = forField.map((r) => r.error)
      const absolute = errors.map(Math.abs)
      return {
        field,
        label: LABEL[field],
        attempts: forField.length,
        within: absolute.filter((e) => e <= TOLERANCE[field]).length,
        meanAbsError: Number(mean(absolute).toFixed(2)),
        bias: Number(mean(errors).toFixed(2)),
        worst: Number(Math.max(...absolute).toFixed(2)),
      }
    })
    .filter((f): f is FieldAccuracy => f !== null)

  const attempts = fields.reduce((n, f) => n + f.attempts, 0)
  const within = fields.reduce((n, f) => n + f.within, 0)

  return {
    fields,
    attempts,
    within,
    hitRate: attempts === 0 ? null : Number((within / attempts).toFixed(2)),
  }
}

/**
 * The ledger in one sentence, for the agent to be told about itself. Phrased
 * as a correction rather than a statistic, because that is what it is for.
 */
export function ledgerNote(ledger: Ledger): string {
  if (ledger.hitRate === null) {
    return 'You have not yet committed to a predicted value. State predicted_mw, ' +
      'predicted_logp and predicted_tpsa when you propose, so your reasoning can be ' +
      'checked against the measurement.'
  }
  const missed = ledger.attempts - ledger.within
  if (missed === 0) {
    return `All ${ledger.attempts} of your predictions so far landed inside tolerance.`
  }
  // Rank by error RELATIVE to each property's tolerance. Raw magnitudes are not
  // comparable across g/mol, log units and square angstroms -- a 3.6 miss on
  // TPSA is comfortably inside tolerance while 0.98 on logP is twice over it.
  const worst = [...ledger.fields]
    .filter((f) => f.within < f.attempts)
    .sort((a, b) => b.meanAbsError / TOLERANCE[b.field] - a.meanAbsError / TOLERANCE[a.field])[0]
  return (
    `You have missed ${missed} of ${ledger.attempts} predictions. Your weakest ` +
    `property is ${worst.label}, off by ${worst.meanAbsError} on average` +
    (Math.abs(worst.bias) > worst.meanAbsError / 2
      ? `, and consistently ${worst.bias > 0 ? 'under' : 'over'}estimated -- correct for ` +
        'that bias in your next proposal.'
      : '. Widen your uncertainty on it rather than stating a confident figure.')
  )
}
