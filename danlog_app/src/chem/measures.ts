import type { Properties } from './properties'

/**
 * How much to trust a number.
 *
 * This is the app's central honesty claim. An agent will state molecular weight
 * and predicted solubility with identical confidence; one of those is addition
 * and the other is a regression with a log unit of error. Labelling the
 * difference costs almost nothing and is the whole reason to prefer this app to
 * asking a model directly.
 */
export type Tier = 'exact' | 'computed' | 'estimated'

export const TIER_ABOUT: Record<Tier, string> = {
  exact: 'Counted or summed from the structure. Not an opinion.',
  computed: 'A published algorithm with known behaviour.',
  estimated: 'A regression fitted to measured data. Useful, not precise.',
}

export type Measure = {
  key: keyof Properties
  label: string
  tier: Tier
  /** Plus or minus, where the method has a published figure. */
  error?: number
  unit?: string
  about: string
}

/**
 * One list drives the property grid, the tool responses and the legend, so the
 * UI and what the agent is told can never disagree about a number's status.
 */
export const MEASURES: Measure[] = [
  {
    key: 'mw',
    label: 'MW',
    tier: 'exact',
    unit: 'g/mol',
    about: 'Molecular weight. The atomic weights added up.',
  },
  {
    key: 'logP',
    label: 'logP',
    tier: 'computed',
    error: 0.5,
    about: 'Greasiness. Crippen fragment method, not a measurement.',
  },
  {
    key: 'tpsa',
    label: 'TPSA',
    tier: 'computed',
    unit: 'A^2',
    about: 'Polar surface area. Predicts gut and blood-brain barrier crossing.',
  },
  {
    key: 'hbd',
    label: 'HBD',
    tier: 'exact',
    about: 'Hydrogen bond donors. A count.',
  },
  {
    key: 'hba',
    label: 'HBA',
    tier: 'exact',
    about: 'Hydrogen bond acceptors. A count.',
  },
  {
    key: 'rotatableBonds',
    label: 'RotB',
    tier: 'exact',
    about: 'Rotatable bonds. How floppy the molecule is.',
  },
  {
    key: 'aromaticRings',
    label: 'ArRings',
    tier: 'exact',
    about: 'Aromatic rings. Too many flat rings hurts solubility.',
  },
  {
    key: 'fsp3',
    label: 'Fsp3',
    tier: 'exact',
    about: 'Fraction of carbons that are three-dimensional. Higher is generally better.',
  },
  {
    key: 'logS',
    label: 'logS',
    tier: 'estimated',
    error: 1.0,
    unit: 'log mol/L',
    about: 'Aqueous solubility, ESOL regression. Roughly one log unit of error either way.',
  },
  {
    key: 'saScore',
    label: 'SAScore',
    tier: 'computed',
    unit: '0-10',
    about: 'Synthetic accessibility: how easy/hard to synthesize. 0=hard, 10=easy.',
  },
  {
    key: 'bbaCrossing',
    label: 'BBB',
    tier: 'computed',
    unit: '%',
    about: 'Blood-brain barrier crossing probability. Relevant for neurological drugs.',
  },
  {
    key: 'hiaScore',
    label: 'HIA',
    tier: 'computed',
    unit: '%',
    about: 'Human intestinal absorption. Predicts oral bioavailability.',
  },
  // === TIER 2: Metabolism & Bioavailability ===
  {
    key: 'metabolicStability',
    label: 'Met. Stability',
    tier: 'computed',
    unit: '0-100',
    about: 'Hepatic metabolic stability. Higher = more resistant to liver metabolism.',
  },
  {
    key: 'cyp3a4Likelihood',
    label: 'CYP3A4',
    tier: 'computed',
    unit: '%',
    about: 'Likelihood of CYP3A4 metabolism. Most common drug-metabolizing enzyme.',
  },
  {
    key: 'cyp2d6Likelihood',
    label: 'CYP2D6',
    tier: 'computed',
    unit: '%',
    about: 'Likelihood of CYP2D6 metabolism. Important for drug-drug interactions.',
  },
  {
    key: 'cyp2c9Likelihood',
    label: 'CYP2C9',
    tier: 'computed',
    unit: '%',
    about: 'Likelihood of CYP2C9 metabolism. Moderate importance for interactions.',
  },
  {
    key: 'oralBioavailability',
    label: 'F%',
    tier: 'computed',
    unit: '%',
    about: 'Estimated oral bioavailability. Combines absorption and metabolism.',
  },
  {
    key: 'pgpEffluxLikelihood',
    label: 'P-gp Efflux',
    tier: 'computed',
    unit: '%',
    about: 'P-glycoprotein efflux risk. Will it be pumped out of cells/brain?',
  },
  {
    key: 'netBrainPenetration',
    label: 'Net BBB',
    tier: 'computed',
    unit: '%',
    about: 'Brain penetration after efflux. BBB crossing minus P-gp export.',
  },
]

export const measureFor = (key: keyof Properties): Measure | undefined =>
  MEASURES.find((m) => m.key === key)

/**
 * The line we will not cross. Asked for any of these, tools say so rather than
 * producing a number, because nothing in a browser can honestly compute them.
 */
export const NOT_COMPUTABLE: Record<string, string> = {
  potency:
    'Binding affinity and potency (IC50, Ki, EC50) cannot be computed from structure ' +
    'alone. They are measured in an assay. This app will not estimate them and neither ' +
    'should you.',
  toxicity:
    'Toxicity cannot be predicted from structure in this app. Pfizer 3/75 flags a known ' +
    'risk pattern; that is a warning, not a prediction.',
  binding:
    'Docking and binding-mode prediction need a protein structure and a force field. ' +
    'Neither ships here.',
  pka:
    'pKa needs either a measurement or a trained model. Neither ships here, so acidity ' +
    'is not available as a number.',
  synthesis: 'Synthetic routes are not predicted here.',
}
