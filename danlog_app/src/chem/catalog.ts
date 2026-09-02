/**
 * Chemistry that ships as data rather than living in a model's memory.
 *
 * Every SMARTS pattern here was executed against molecules known to contain
 * the group and molecules known not to, and the expected matches confirmed.
 * See the note on `SUPERSEDES` for the one thing the patterns deliberately do
 * not try to express.
 */

export type Group = {
  label: string
  smarts: string
  about: string
}

/**
 * What is actually in this molecule, named. Useful on its own, and it is what
 * the bioisostere suggestions key off.
 */
export const FUNCTIONAL_GROUPS: Group[] = [
  { label: 'carboxylic acid', smarts: '[CX3](=[OX1])[OX2H1]', about: 'Acidic. Charged at blood pH, which drives solubility and blocks membrane crossing.' },
  { label: 'ester', smarts: '[CX3](=[OX1])[OX2H0][#6]', about: 'Readily cut by esterases in the body. Often a deliberate prodrug handle.' },
  { label: 'amide', smarts: '[NX3][CX3](=[OX1])', about: 'The bond that links amino acids. Stable, and a strong hydrogen bonder.' },
  { label: 'urea', smarts: '[NX3][CX3](=[OX1])[NX3]', about: 'Two donors and an acceptor in one rigid unit.' },
  { label: 'carbamate', smarts: '[NX3][CX3](=[OX1])[OX2][#6]', about: 'Between an amide and an ester in stability.' },
  { label: 'hydroxamic acid', smarts: '[CX3](=[OX1])[NX3][OX2H]', about: 'Binds metal ions strongly. The zinc-binding group in several drugs.' },
  { label: 'ketone', smarts: '[#6][CX3](=[OX1])[#6]', about: 'Hydrogen bond acceptor.' },
  { label: 'aldehyde', smarts: '[CX3H1](=[OX1])[#6]', about: 'Reactive toward amines. Usually unwanted in a drug.' },
  { label: 'alcohol', smarts: '[OX2H][CX4]', about: 'Donor and acceptor. Cheap solubility.' },
  { label: 'phenol', smarts: '[OX2H][c]', about: 'An OH on an aromatic ring. Mildly acidic; prone to metabolism.' },
  { label: 'ether', smarts: '[OD2;!$(O[CX3]=[OX1]);!R3]([#6])[#6]', about: 'Acceptor only, no donor. Metabolically softer than it looks.' },
  { label: 'primary amine', smarts: '[NX3;H2;!$(NC=O)][#6]', about: 'Basic. Usually positively charged in the body.' },
  { label: 'secondary amine', smarts: '[NX3;H1;!$(NC=O)]([#6])[#6]', about: 'Basic, one donor.' },
  { label: 'tertiary amine', smarts: '[NX3;H0;!$(NC=O);!$(N=*);!$([N+])]([#6])([#6])[#6]', about: 'Basic, no donor. Common solubilising handle.' },
  { label: 'aniline nitrogen', smarts: '[NX3;!$(NC=O);!$(N~O);!$(N#*)][c]', about: 'Nitrogen on an aromatic ring. Much less basic than an alkyl amine.' },
  { label: 'nitrile', smarts: '[NX1]#[CX2]', about: 'Small, linear, weakly accepting. A common acid replacement.' },
  { label: 'nitro', smarts: '[$([NX3](=O)=O),$([NX3+](=O)[O-])]', about: 'Strongly electron-withdrawing, and a recognised toxicity concern.' },
  { label: 'sulfonamide', smarts: '[SX4](=[OX1])(=[OX1])[NX3]', about: 'Acidic when N-H. The core of a whole drug class.' },
  { label: 'sulfone', smarts: '[SX4](=[OX1])(=[OX1])([#6])[#6]', about: 'Strong acceptor, very polar, metabolically stable.' },
  { label: 'thiol', smarts: '[SX2H]', about: 'Highly reactive. Rarely survives as a drug.' },
  { label: 'tetrazole', smarts: 'c1nn[nH]n1', about: 'Acidic ring with almost the same pKa as a carboxylic acid. The classic acid replacement.' },
  { label: 'guanidine', smarts: '[NX3][CX3](=[NX2])[NX3]', about: 'Very strongly basic. Permanently charged in the body.' },
  { label: 'trifluoromethyl', smarts: '[CX4](F)(F)F', about: 'Blocks metabolism and raises lipophilicity.' },
  { label: 'halogen', smarts: '[F,Cl,Br,I]', about: 'Tunes lipophilicity and blocks metabolic hot spots.' },
  { label: 'alkene', smarts: '[CX3]=[CX3]', about: 'Rigid, planar, and a possible metabolic site.' },
  { label: 'alkyne', smarts: '[CX2]#[CX2]', about: 'Rigid linear spacer.' },
  { label: 'benzene ring', smarts: 'c1ccccc1', about: 'The most common ring in drugs. Flat, greasy.' },
  { label: 'pyridine', smarts: 'n1ccccc1', about: 'Benzene with one nitrogen. More soluble, weakly basic.' },
]

/**
 * Group overlap is real chemistry, not a bug: a carbamate genuinely contains
 * both an ester and an amide substructure.
 *
 * Two things were tried and rejected before this. Contorting the SMARTS to
 * exclude each other fails, because the obvious exclusion also matches the
 * group's own carbonyl -- `[CX3](=[OX1])[OX2H0;!$(O[CX3]=[OX1])][#6]` matches
 * no ester at all. Suppressing a label across the whole molecule fails too: it
 * hid aspirin's genuine ester behind its separate carboxylic acid, and
 * vorinostat's anilide amide behind its hydroxamic acid.
 *
 * So suppression is applied PER SITE in `profile.ts` -- a general group is
 * dropped only where its atoms sit inside a more specific group's atoms.
 */
export const SUPERSEDES: Record<string, string[]> = {
  urea: ['amide'],
  carbamate: ['amide', 'ester'],
  'hydroxamic acid': ['amide'],
  guanidine: ['primary amine', 'secondary amine'],
  trifluoromethyl: ['halogen'],
  phenol: ['alcohol'],
}

export type Alert = {
  label: string
  smarts: string
  severity: 'high' | 'medium'
  why: string
}

/**
 * Structural alerts -- groups that make medicinal chemists wince.
 *
 * DELIBERATELY A SMALL, VERIFIED SET. The published catalogs (PAINS, Brenk,
 * NIH) run to hundreds of patterns and this is not them; claiming otherwise
 * would be exactly the false authority this app exists to avoid. Every entry
 * below is a well-established liability that was tested against a molecule
 * known to contain it.
 */
export const ALERTS: Alert[] = [
  { label: 'aldehyde', smarts: '[CX3H1](=[OX1])[#6]', severity: 'high', why: 'Reacts with amines in proteins. Usually toxic and rarely developable.' },
  { label: 'Michael acceptor', smarts: '[CX3]=[CX3][CX3]=[OX1]', severity: 'high', why: 'Reacts covalently with thiols. A frequent-hitter pattern unless covalency is the intent.' },
  { label: 'epoxide', smarts: '[OX2r3]1[#6r3][#6r3]1', severity: 'high', why: 'Strained and highly reactive. Alkylates DNA and protein.' },
  { label: 'aziridine', smarts: '[NX3r3]1[#6r3][#6r3]1', severity: 'high', why: 'Strained and alkylating, like an epoxide.' },
  { label: 'acyl halide', smarts: '[CX3](=[OX1])[F,Cl,Br,I]', severity: 'high', why: 'Reacts with water on contact. Not a drug, a reagent.' },
  { label: 'anhydride', smarts: '[CX3](=[OX1])[OX2][CX3](=[OX1])', severity: 'high', why: 'Acylates anything nucleophilic. Hydrolyses immediately.' },
  { label: 'isocyanate', smarts: '[NX2]=[CX2]=[OX1]', severity: 'high', why: 'Violently reactive toward amines and water.' },
  { label: 'peroxide', smarts: '[OX2][OX2]', severity: 'high', why: 'Unstable and potentially explosive.' },
  { label: 'azide', smarts: '[NX1]~[NX2]~[NX2]', severity: 'high', why: 'Energetic and often toxic.' },
  { label: 'catechol', smarts: '[OX2H]c1ccccc1[OX2H]', severity: 'medium', why: 'Classic assay interference: redox cycling and metal chelation make it hit everything.' },
  { label: 'quinone', smarts: 'O=C1[#6]=[#6]C(=O)[#6]=[#6]1', severity: 'medium', why: 'Redox cycler. Produces reactive oxygen and false positives.' },
  { label: 'hydrazine', smarts: '[NX3][NX3]', severity: 'medium', why: 'Associated with liver toxicity and mutagenicity.' },
  { label: 'thiol', smarts: '[SX2H]', severity: 'medium', why: 'Oxidises readily and binds metals indiscriminately.' },
  { label: 'nitro', smarts: '[$([NX3](=O)=O),$([NX3+](=O)[O-])]', severity: 'medium', why: 'Can be reduced to reactive species. A recognised mutagenicity concern.' },
]

export type Bioisostere = {
  /** Functional group label this replaces -- keys into FUNCTIONAL_GROUPS. */
  replaces: string
  to: string
  /** Rough direction of travel, not a computed value. */
  effect: string
}

/**
 * Bioisostere suggestions.
 *
 * The minimal RDKit build has no reaction support, so the app cannot apply a
 * transformation. That turns out to be the right shape: we supply the
 * knowledge, the agent writes the new SMILES, and the app checks what came
 * back. Suggestion, generation and verification stay with the party that
 * should own each.
 *
 * `effect` is a direction, never a number. The actual numbers come from
 * computing the proposed molecule.
 */
export const BIOISOSTERES: Bioisostere[] = [
  { replaces: 'carboxylic acid', to: 'tetrazole', effect: 'Similar acidity, usually better membrane crossing, MW up by roughly 25.' },
  { replaces: 'carboxylic acid', to: 'acylsulfonamide', effect: 'Keeps acidity, adds bulk and hydrogen bonding.' },
  { replaces: 'carboxylic acid', to: 'hydroxamic acid', effect: 'Weaker acid, strong metal binder.' },
  { replaces: 'carboxylic acid', to: 'primary amide', effect: 'Removes the charge entirely. Raises logP, loses acidity.' },
  { replaces: 'ester', to: 'amide', effect: 'Much more stable to hydrolysis. Adds a donor, lowers logP.' },
  { replaces: 'ester', to: '1,2,4-oxadiazole', effect: 'Ester-like shape without the hydrolysis liability.' },
  { replaces: 'amide', to: '1,2,4-triazole', effect: 'Resists proteases, keeps the hydrogen bonding pattern.' },
  { replaces: 'amide', to: 'sulfonamide', effect: 'More acidic N-H, different geometry, more polar.' },
  { replaces: 'phenol', to: 'indazole or benzimidazole NH', effect: 'Keeps the donor while avoiding rapid conjugation and clearance.' },
  { replaces: 'phenol', to: 'methyl ether', effect: 'Blocks metabolism, loses the donor, raises logP.' },
  { replaces: 'benzene ring', to: 'pyridine', effect: 'Lowers logP by roughly 1, adds an acceptor, improves solubility.' },
  { replaces: 'benzene ring', to: 'thiophene', effect: 'Similar size and lipophilicity, different electronics.' },
  { replaces: 'benzene ring', to: 'bicyclo[1.1.1]pentane', effect: 'Escapes flatness. Raises Fsp3, often improves solubility.' },
  { replaces: 'ketone', to: 'sulfone', effect: 'Stronger acceptor, much more polar, metabolically stable.' },
  { replaces: 'aldehyde', to: 'nitrile', effect: 'Removes the reactivity while keeping a small linear group.' },
  { replaces: 'thiol', to: 'alcohol', effect: 'Removes the oxidation and metal-binding liability.' },
  { replaces: 'nitro', to: 'nitrile or trifluoromethyl', effect: 'Keeps electron withdrawal, drops the mutagenicity concern.' },
  { replaces: 'tertiary amine', to: 'morpholine or piperazine', effect: 'Tunes basicity and adds solubility with a ring.' },
  { replaces: 'halogen', to: 'trifluoromethyl', effect: 'Blocks metabolism more thoroughly, raises logP.' },
]
