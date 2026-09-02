import type { Candidate } from '../store/workbench'

/**
 * Getting work out of the app. A workbench you cannot export from is a demo,
 * not a tool.
 */

const COLUMNS = [
  'smiles',
  'status',
  'source',
  'mw',
  'logP',
  'tpsa',
  'hbd',
  'hba',
  'rotatableBonds',
  'aromaticRings',
  'fsp3',
  'logS',
  'solubilityBand',
  'rulesPass',
  'violations',
  'scaffoldKept',
  'similarityToParent',
  'rationale',
] as const

/** Quotes only when needed, doubling inner quotes, per RFC 4180. */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(candidates: Candidate[]): string {
  const rows = candidates.map((c) =>
    [
      c.properties.canonicalSmiles,
      c.status,
      c.source,
      c.properties.mw,
      c.properties.logP,
      c.properties.tpsa,
      c.properties.hbd,
      c.properties.hba,
      c.properties.rotatableBonds,
      c.properties.aromaticRings,
      c.properties.fsp3,
      c.properties.logS,
      c.properties.solubilityBand,
      c.rules.passes,
      c.rules.violations.join('; '),
      c.scaffoldOk === null ? '' : c.scaffoldOk,
      c.similarityToParent ?? '',
      c.rationale,
    ]
      .map(cell)
      .join(','),
  )
  return [COLUMNS.join(','), ...rows].join('\n')
}

/** SMILES plus a name, which is the format every cheminformatics tool reads. */
export function toSmiles(candidates: Candidate[]): string {
  return candidates
    .map((c, i) => `${c.properties.canonicalSmiles}\tcandidate_${i + 1}_${c.status}`)
    .join('\n')
}

export function download(filename: string, contents: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
