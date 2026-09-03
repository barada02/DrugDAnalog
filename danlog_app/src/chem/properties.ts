import { getRDKit, withMol } from './rdkit'
import { esol } from './solubility'
import { calculateSAScore } from './sascore'
import { calculateBBBProbability, calculateHIAScore } from './bioavailability'
import { calculateMetabolicStability } from './metabolic-stability'
import { predictCYP450Profile } from './cyp450-prediction'
import { estimateOralBioavailability } from './bioavailability-combined'
import { predictPGpEfflux } from './pgp-efflux'

/** The subset of RDKit's 43 descriptors the workbench actually reasons about. */
export type Properties = {
  smiles: string
  canonicalSmiles: string
  mw: number
  logP: number
  tpsa: number
  hbd: number
  hba: number
  rotatableBonds: number
  heavyAtoms: number
  rings: number
  aromaticRings: number
  /** Fraction of carbons that are sp3, i.e. how three-dimensional it is. */
  fsp3: number
  /** ESOL estimate. See solubility.ts for the error bar that goes with it. */
  logS: number
  solubilityMgPerL: number
  solubilityBand: string
  /**
   * Stereocentres the SMILES leaves undefined. Anything above zero means the
   * string describes 2^n compounds rather than one, which agents rarely notice.
   */
  undefinedStereocentres: number
  /** Synthetic Accessibility Score: 0-10, 0=hard 10=easy */
  saScore: number
  /** Blood-Brain Barrier crossing probability: 0-100% */
  bbaCrossing: number
  /** Human Intestinal Absorption score: 0-100% */
  hiaScore: number
  // === TIER 2: Metabolism & Bioavailability ===
  /** Metabolic stability score (0-100, higher = more stable) */
  metabolicStability: number
  /** Predicted half-life category */
  halfLifeCategory: 'very short' | 'short' | 'moderate' | 'long' | 'very long'
  /** CYP3A4 substrate likelihood (0-100%) */
  cyp3a4Likelihood: number
  /** CYP2D6 substrate likelihood (0-100%) */
  cyp2d6Likelihood: number
  /** CYP2C9 substrate likelihood (0-100%) */
  cyp2c9Likelihood: number
  /** Dominant metabolizing enzyme */
  dominantCYP: 'CYP3A4' | 'CYP2D6' | 'CYP2C9' | 'CYP2C19' | 'CYP1A2' | 'other'
  /** Combined oral bioavailability estimate (F%, 0-100) */
  oralBioavailability: number
  /** P-gp efflux substrate likelihood (0-100%) */
  pgpEffluxLikelihood: number
  /** Net brain penetration after accounting for efflux (0-100%) */
  netBrainPenetration: number
}

type RawDescriptors = Record<string, number>

const round = (n: number, places = 2) => Number(n.toFixed(places))

/**
 * The canonical form of a SMILES string. Two spellings of the same molecule
 * produce the same canonical output, which is what makes equality -- and
 * therefore duplicate detection -- possible at all.
 */
export async function canonicalize(smiles: string): Promise<string> {
  return withMol(smiles, (mol) => mol.get_smiles())
}

/**
 * ESOL needs the share of heavy atoms that are aromatic, which is not one of
 * the 43 descriptors. Counting `[a]` matches is the cheapest way to get it.
 */
async function aromaticProportion(smiles: string, heavyAtoms: number): Promise<number> {
  if (heavyAtoms === 0) return 0
  const rdkit = await getRDKit()
  let mol = null
  let query = null
  try {
    mol = rdkit.get_mol(smiles)
    query = rdkit.get_qmol('[a]')
    if (!mol?.is_valid() || !query?.is_valid()) return 0
    const matches = JSON.parse(mol.get_substruct_matches(query)) as unknown
    return (Array.isArray(matches) ? matches.length : 0) / heavyAtoms
  } finally {
    mol?.delete()
    query?.delete()
  }
}

export async function computeProperties(smiles: string): Promise<Properties> {
  const base = await withMol(smiles, (mol) => {
    const d = JSON.parse(mol.get_descriptors()) as RawDescriptors
    return {
      smiles,
      canonicalSmiles: mol.get_smiles(),
      mw: round(d.amw, 3),
      logP: round(d.CrippenClogP),
      tpsa: round(d.tpsa),
      hbd: d.lipinskiHBD,
      hba: d.lipinskiHBA,
      rotatableBonds: d.NumRotatableBonds,
      heavyAtoms: d.NumHeavyAtoms,
      rings: d.NumRings,
      aromaticRings: d.NumAromaticRings,
      fsp3: round(d.FractionCSP3),
      undefinedStereocentres: d.NumUnspecifiedAtomStereoCenters,
    }
  })

  const solubility = esol({
    logP: base.logP,
    mw: base.mw,
    rotatableBonds: base.rotatableBonds,
    aromaticProportion: await aromaticProportion(smiles, base.heavyAtoms),
  })

  // Calculate TIER 1 bioavailability and synthesis metrics
  const saScore = await calculateSAScore(smiles)
  const bbaCrossing = calculateBBBProbability({
    logP: base.logP,
    tpsa: base.tpsa,
    mw: base.mw,
    hbd: base.hbd,
  })
  const hiaScore = calculateHIAScore({
    tpsa: base.tpsa,
    mw: base.mw,
    hba: base.hba,
    hbd: base.hbd,
    logP: base.logP,
  })

  // === TIER 2: Metabolism and Advanced Bioavailability ===
  const metabolic = calculateMetabolicStability(base as any)
  const cyp450 = predictCYP450Profile(base as any)
  const pgp = predictPGpEfflux(base as any)

  // Combine all bioavailability factors
  const bioavail = estimateOralBioavailability(
    base as any,
    metabolic,
    hiaScore,
  )

  return {
    ...base,
    logS: solubility.logS,
    solubilityMgPerL: solubility.mgPerL,
    solubilityBand: solubility.band,
    saScore: round(saScore),
    bbaCrossing,
    hiaScore,
    // TIER 2 fields
    metabolicStability: metabolic.stabilityScore,
    halfLifeCategory: metabolic.halfLife,
    cyp3a4Likelihood: cyp450.cyp3a4.likelihood,
    cyp2d6Likelihood: cyp450.cyp2d6.likelihood,
    cyp2c9Likelihood: cyp450.cyp2c9.likelihood,
    dominantCYP: cyp450.dominantEnzyme,
    oralBioavailability: bioavail.fPercent,
    pgpEffluxLikelihood: pgp.effluxProbability,
    netBrainPenetration: pgp.netBrainPenetration,
  }
}

export type RenderOptions = {
  width?: number
  height?: number
  /** Atom indices to shade -- comes straight from a `Match`. */
  atoms?: number[]
  bonds?: number[]
}

export async function renderSvg(smiles: string, options: RenderOptions = {}): Promise<string> {
  const { width = 320, height = 240, atoms, bonds } = options
  const details: Record<string, unknown> = {
    width,
    height,
    backgroundColour: [0, 0, 0, 0],
  }
  // Only send the highlight keys when there is something to highlight; an empty
  // atoms array makes RDKit draw nothing rather than drawing everything plain.
  if (atoms?.length) {
    details.atoms = atoms
    details.bonds = bonds ?? []
    details.highlightColour = [0.42, 0.66, 1.0, 0.45]
  }
  return withMol(smiles, (mol) => mol.get_svg_with_highlights(JSON.stringify(details)))
}

export const PRESETS: { name: string; smiles: string }[] = [
  { name: 'Aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'Ibuprofen', smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O' },
  { name: 'Paracetamol', smiles: 'CC(=O)Nc1ccc(O)cc1' },
  { name: 'Caffeine', smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C' },
]
