/**
 * ESOL -- Delaney's aqueous solubility estimate.
 *
 * A four-term linear regression, which is why we can run it: every input is
 * something RDKit already hands us. It is the only way this app can answer
 * "make it more soluble" with a number instead of gesturing at logP.
 *
 * It is a regression fitted to measured data, NOT a computation. Roughly one
 * log unit of error either way, and it is reported that way everywhere it is
 * shown. Delaney (2004), J. Chem. Inf. Comput. Sci. 44, 1000-1005.
 */

/** Published error of the model. Shown to humans and returned to agents. */
export const ESOL_ERROR = 1.0

export type Solubility = {
  /** log10 of solubility in mol/L. Higher is more soluble. */
  logS: number
  /** Milligrams per litre, which is the unit people actually think in. */
  mgPerL: number
  band: 'insoluble' | 'poorly soluble' | 'moderately soluble' | 'soluble' | 'very soluble'
}

/**
 * Bands follow the conventional reading of logS. The boundaries are rules of
 * thumb, not physical constants, so nothing downstream branches on them --
 * they exist to make a bare number legible.
 */
function band(logS: number): Solubility['band'] {
  if (logS < -6) return 'insoluble'
  if (logS < -4) return 'poorly soluble'
  if (logS < -2) return 'moderately soluble'
  if (logS < 0) return 'soluble'
  return 'very soluble'
}

export function esol(input: {
  logP: number
  mw: number
  rotatableBonds: number
  /** Aromatic heavy atoms divided by all heavy atoms. */
  aromaticProportion: number
}): Solubility {
  const logS =
    0.16 -
    0.63 * input.logP -
    0.0062 * input.mw +
    0.066 * input.rotatableBonds -
    0.74 * input.aromaticProportion

  return {
    logS: Number(logS.toFixed(2)),
    // mol/L -> mg/L, so the number means something without a calculator.
    mgPerL: Number((10 ** logS * input.mw * 1000).toPrecision(3)),
    band: band(logS),
  }
}
