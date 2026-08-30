import { withMol } from './rdkit'

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
}

export type LipinskiResult = {
  passes: boolean
  violations: string[]
}

type RawDescriptors = Record<string, number>

const round = (n: number, places = 2) => Number(n.toFixed(places))

export async function computeProperties(smiles: string): Promise<Properties> {
  return withMol(smiles, (mol) => {
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
    }
  })
}

/**
 * Lipinski's rule of five. Reported with the specific rule named, because
 * "fails Lipinski" is useless to an agent trying to fix it.
 */
export function lipinski(p: Properties): LipinskiResult {
  const violations: string[] = []
  if (p.mw > 500) violations.push(`MW ${p.mw} > 500`)
  if (p.logP > 5) violations.push(`logP ${p.logP} > 5`)
  if (p.hbd > 5) violations.push(`HBD ${p.hbd} > 5`)
  if (p.hba > 10) violations.push(`HBA ${p.hba} > 10`)
  return { passes: violations.length === 0, violations }
}

export async function renderSvg(smiles: string, width = 320, height = 240): Promise<string> {
  return withMol(smiles, (mol) =>
    mol.get_svg_with_highlights(JSON.stringify({ width, height, backgroundColour: [0, 0, 0, 0] })),
  )
}

export const PRESETS: { name: string; smiles: string }[] = [
  { name: 'Aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'Ibuprofen', smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O' },
  { name: 'Paracetamol', smiles: 'CC(=O)Nc1ccc(O)cc1' },
  { name: 'Caffeine', smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C' },
]
