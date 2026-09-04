import type { Candidate } from '../store/workbench'
import type { Properties } from './properties'

/**
 * Reports.
 *
 * The agent supplies judgement and structure; this app supplies every number,
 * every drawing and every table. That split is deliberate and it is the whole
 * design: a model writing "MW 153.14" into prose is reciting, not measuring,
 * and a document carrying your project's name is the last place a recalled
 * number should appear. So sections reference molecules by candidate id and
 * the renderer fills in the chemistry from live state.
 *
 * What the agent is allowed to write, therefore, is exactly what it is good
 * at: what it thinks, and why.
 */

export type SectionType =
  | 'text'
  | 'brief'
  | 'molecules'
  | 'properties'
  | 'comparison'
  | 'recommendation'
  | 'evolution'
  | 'ledger'

type Base = { id: string }

export type ReportSection =
  /** Prose. The agent's own words, rendered as text and never as markup. */
  | (Base & { type: 'text'; heading?: string; body: string })
  /** The design goal, target profile and pinned group, from live state. */
  | (Base & { type: 'brief' })
  /** A gallery of structures. 3D is used where a conformer has been fetched. */
  | (Base & { type: 'molecules'; candidateIds: string[]; caption?: string; includeFocus?: boolean })
  /** A property table. Values come from RDKit, not from the agent. */
  | (Base & {
      type: 'properties'
      candidateIds: string[]
      properties?: (keyof Properties)[]
      caption?: string
    })
  /** The delta table against the focus molecule. */
  | (Base & { type: 'comparison'; candidateIds: string[]; caption?: string })
  /** The pick, with the agent's reasoning beside the candidate's real numbers. */
  | (Base & { type: 'recommendation'; candidateId: string; body: string })
  /** The design tree and how the board converged on the brief. */
  | (Base & { type: 'evolution' })
  /** How often the agent's own stated numbers survived checking. */
  | (Base & { type: 'ledger' })

export type Report = {
  title: string
  subtitle?: string
  /** Who drafted it. Only ever 'agent' today; a human draft would say so. */
  author: 'agent' | 'human'
  createdAt: number
  sections: ReportSection[]
}

export const MAX_SECTIONS = 24
export const MAX_BODY = 4000
export const MAX_MOLECULES_PER_SECTION = 8

/** Sections whose whole content is generated, so the agent supplies nothing. */
const GENERATED: SectionType[] = ['brief', 'evolution', 'ledger']

const KNOWN: SectionType[] = [
  'text',
  'brief',
  'molecules',
  'properties',
  'comparison',
  'recommendation',
  'evolution',
  'ledger',
]

export type Validation =
  | { ok: true; report: Report }
  | { ok: false; error: string; hint: string }

const newId = () => crypto.randomUUID()

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Turns whatever the agent sent into a Report, or explains what is wrong in
 * terms it can act on. Unknown candidate ids are named rather than dropped:
 * silently omitting a molecule from a report is worse than refusing to build
 * one, because nobody notices the omission.
 */
export function validateReport(
  input: unknown,
  candidates: Candidate[],
  hasFocus: boolean,
): Validation {
  const raw = input as { title?: unknown; subtitle?: unknown; sections?: unknown }

  const title = text(raw?.title)
  if (!title) {
    return {
      ok: false,
      error: 'A report needs a title.',
      hint: 'Pass a short descriptive title, e.g. "Solubility review of the paracetamol series".',
    }
  }

  if (!Array.isArray(raw?.sections) || raw.sections.length === 0) {
    return {
      ok: false,
      error: 'A report needs at least one section.',
      hint:
        'Pass sections as an array. A useful default is: brief, then text, then comparison, ' +
        'then recommendation.',
    }
  }

  if (raw.sections.length > MAX_SECTIONS) {
    return {
      ok: false,
      error: `A report may have at most ${MAX_SECTIONS} sections; ${raw.sections.length} were sent.`,
      hint: 'Combine related prose into fewer, longer text sections.',
    }
  }

  const byId = new Map(candidates.map((c) => [c.id, c]))
  const sections: ReportSection[] = []

  /** Ids the agent named that are not on the board. */
  const missing = (ids: string[]) => ids.filter((id) => !byId.has(id))

  for (const [index, entry] of raw.sections.entries()) {
    const s = entry as Record<string, unknown>
    const type = text(s?.type) as SectionType
    const where = `Section ${index + 1}`

    if (!KNOWN.includes(type)) {
      return {
        ok: false,
        error: `${where} has an unknown type ${JSON.stringify(s?.type)}.`,
        hint: `Use one of: ${KNOWN.join(', ')}.`,
      }
    }

    if (GENERATED.includes(type)) {
      sections.push({ id: newId(), type } as ReportSection)
      continue
    }

    if (type === 'text') {
      const body = text(s.body)
      if (!body) {
        return {
          ok: false,
          error: `${where} is a text section with no body.`,
          hint: 'Write the paragraph in `body`. Do not quote property values in prose — ' +
            'add a properties or comparison section and the app prints the real numbers.',
        }
      }
      sections.push({
        id: newId(),
        type: 'text',
        heading: text(s.heading) || undefined,
        body: body.slice(0, MAX_BODY),
      })
      continue
    }

    if (type === 'recommendation') {
      const candidateId = text(s.candidateId)
      const body = text(s.body)
      if (!byId.has(candidateId)) {
        return {
          ok: false,
          error: `${where} recommends candidate ${JSON.stringify(candidateId)}, which is not on the board.`,
          hint: 'Call get_workbench_state and use one of the candidate ids it returns.',
        }
      }
      if (!body) {
        return {
          ok: false,
          error: `${where} recommends a candidate without saying why.`,
          hint: 'Put the reasoning in `body`. This is the part only you can write.',
        }
      }
      sections.push({
        id: newId(),
        type: 'recommendation',
        candidateId,
        body: body.slice(0, MAX_BODY),
      })
      continue
    }

    // The three that take a list of molecules.
    const ids = Array.isArray(s.candidateIds) ? s.candidateIds.map(text).filter(Boolean) : []
    const includeFocus = type === 'molecules' && s.includeFocus === true

    if (ids.length === 0 && !(includeFocus && hasFocus)) {
      return {
        ok: false,
        error: `${where} is a ${type} section with no molecules.`,
        hint: 'Pass candidateIds from get_workbench_state, or set includeFocus true to show ' +
          'the focus molecule.',
      }
    }

    const unknown = missing(ids)
    if (unknown.length > 0) {
      return {
        ok: false,
        error: `${where} names ${unknown.length} candidate id(s) that are not on the board: ${unknown.join(', ')}.`,
        hint: 'Call get_workbench_state for the current ids. Do not invent or reuse ids from ' +
          'an earlier session.',
      }
    }

    if (ids.length > MAX_MOLECULES_PER_SECTION) {
      return {
        ok: false,
        error: `${where} has ${ids.length} molecules; the limit is ${MAX_MOLECULES_PER_SECTION}.`,
        hint: 'Split it into several sections, or narrow it to the candidates that matter.',
      }
    }

    if (type === 'molecules') {
      sections.push({
        id: newId(),
        type: 'molecules',
        candidateIds: ids,
        caption: text(s.caption) || undefined,
        includeFocus,
      })
    } else if (type === 'properties') {
      const props = Array.isArray(s.properties)
        ? (s.properties.map(text).filter(Boolean) as (keyof Properties)[])
        : undefined
      sections.push({
        id: newId(),
        type: 'properties',
        candidateIds: ids,
        properties: props && props.length > 0 ? props : undefined,
        caption: text(s.caption) || undefined,
      })
    } else {
      sections.push({
        id: newId(),
        type: 'comparison',
        candidateIds: ids,
        caption: text(s.caption) || undefined,
      })
    }
  }

  return {
    ok: true,
    report: {
      title: title.slice(0, 160),
      subtitle: text(raw.subtitle).slice(0, 240) || undefined,
      author: 'agent',
      createdAt: Date.now(),
      sections,
    },
  }
}

/** Human-readable name for a section, used by the editor. */
export const SECTION_LABEL: Record<SectionType, string> = {
  text: 'Narrative',
  brief: 'Design brief',
  molecules: 'Structures',
  properties: 'Property table',
  comparison: 'Comparison',
  recommendation: 'Recommendation',
  evolution: 'Evolution',
  ledger: 'Prediction ledger',
}
