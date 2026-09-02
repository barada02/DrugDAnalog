/**
 * Common functional groups as SMARTS patterns, so pinning a scaffold is a click
 * rather than a chemistry exam. Anyone who wants to write their own still can.
 *
 * SMARTS is to a molecule what a regular expression is to a string: it
 * describes a shape to look for rather than one specific compound.
 */
export type Group = {
  label: string
  smarts: string
  /** Plain-language gloss, shown to the human and sent to the agent. */
  about: string
}

export const GROUPS: Group[] = [
  {
    label: 'amide',
    smarts: '[NX3][CX3](=[OX1])',
    about: 'The bond that links amino acids; the core of paracetamol.',
  },
  {
    label: 'ester',
    smarts: '[CX3](=[OX1])[OX2H0][#6]',
    about: "Aspirin's defining group. Readily broken down in the body.",
  },
  {
    label: 'carboxylic acid',
    smarts: '[CX3](=[OX1])[OX2H1]',
    about: 'Acidic; strongly affects solubility and charge at blood pH.',
  },
  {
    label: 'phenol',
    smarts: '[OX2H][c]',
    about: 'An OH group on an aromatic ring, as in paracetamol.',
  },
  {
    label: 'benzene ring',
    smarts: 'c1ccccc1',
    about: 'The most common ring in drugs.',
  },
  {
    label: 'primary amine',
    smarts: '[NX3;H2][#6]',
    about: 'Basic; usually positively charged in the body.',
  },
]

export const findGroup = (label: string): Group | undefined =>
  GROUPS.find((g) => g.label === label)
