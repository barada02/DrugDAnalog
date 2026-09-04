import { useMemo, useRef, useState } from 'react'
import { useWorkbench } from '../store/workbench'
import type { Candidate, Molecule } from '../store/workbench'
import type { Properties } from '../chem/properties'
import { measureFor } from '../chem/measures'
import { describeConstraint } from '../chem/constraints'
import { buildLedger } from '../chem/ledger'
import { briefProgress } from '../chem/progress'
import { deltaFor, generationMap, rankLabel, type Ranked } from '../chem/ranking'
import { SECTION_LABEL, type Report, type ReportSection } from '../chem/report'
import { EmptyState, SectionHead, StatusBadge } from '../ui/primitives'
import { DeltaValue, Depiction } from '../ui/molecule'
import { LineChart, SERIES_COLORS, type LineSeries } from '../ui/charts'
import { shortName } from '../ui/CandidateCard'
import { usePresetName } from '../ui/usePresetName'
import { captureAll3d, knownImage3d } from '../ui/capture3d'
import { buildReportHtml, buildReportMarkdown } from '../ui/report-export'
import { download } from '../chem/export'

/**
 * The report page.
 *
 * The agent drafts, the human edits and downloads. Every number, structure and
 * chart on this page is rendered from live state -- the draft only says which
 * molecules to show and in what order, plus the prose the agent actually wrote.
 */

const DEFAULT_PROPERTIES: (keyof Properties)[] = [
  'mw',
  'logP',
  'tpsa',
  'logS',
  'hbd',
  'hba',
  'rotatableBonds',
  'saScore',
  'hiaScore',
]

type Ctx = {
  candidates: Candidate[]
  byId: Map<string, Candidate>
  focus: Molecule | null
  ranked: Ranked[]
  images3d: Map<string, string>
}

const nameOf = (c: Candidate, ranked: Ranked[]) => {
  const hit = ranked.find((r) => r.candidate.id === c.id)
  return hit ? `Candidate ${rankLabel(hit.rank)}` : shortName(c)
}

// --- individual sections -----------------------------------------------------

function MoleculeFigure({
  svg,
  image3d,
  title,
  subtitle,
}: {
  svg: string
  image3d?: string
  title: string
  subtitle?: string
}) {
  return (
    <figure className="rfig">
      <div className="rfig__views">
        <Depiction svg={svg} size="md" />
        {image3d && <img className="rfig__3d" src={image3d} alt={`3D structure of ${title}`} />}
      </div>
      <figcaption>
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </figcaption>
    </figure>
  )
}

function PropertyTable({
  molecules,
  properties,
}: {
  molecules: { key: string; label: string; properties: Properties }[]
  properties: (keyof Properties)[]
}) {
  return (
    <div className="tablewrap">
      <table className="ctable">
        <thead>
          <tr>
            <th className="ctable__corner">Property</th>
            {molecules.map((m) => (
              <th key={m.key}>
                <span className="ctable__colname">{m.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {properties.map((key) => {
            const measure = measureFor(key)
            return (
              <tr key={key}>
                <td className="ctable__name" title={measure?.about}>
                  {measure?.label ?? String(key)}
                </td>
                {molecules.map((m) => (
                  <td key={m.key}>
                    <span className="ctable__val">{String(m.properties[key])}</span>
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SectionBody({ section, ctx }: { section: ReportSection; ctx: Ctx }) {
  const goal = useWorkbench((s) => s.goal)
  const constraints = useWorkbench((s) => s.constraints)
  const scaffold = useWorkbench((s) => s.scaffold)
  const focusId = useWorkbench((s) => s.focusId)
  const focusName = usePresetName(ctx.focus?.properties.canonicalSmiles ?? null)

  switch (section.type) {
    case 'text':
      return (
        <>
          {section.heading && <h3>{section.heading}</h3>}
          {section.body.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </>
      )

    case 'brief':
      return (
        <>
          <h3>Design brief</h3>
          <p>{goal || 'No design goal was recorded for this series.'}</p>
          <dl className="rkv">
            <div>
              <dt>Starting molecule</dt>
              <dd>
                {focusName ?? 'Custom molecule'}
                <code className="smiles">
                  {ctx.focus?.properties.canonicalSmiles ?? 'none loaded'}
                </code>
              </dd>
            </div>
            <div>
              <dt>Preserved group</dt>
              <dd>{scaffold ? `${scaffold.label} (${scaffold.smarts})` : 'None pinned'}</dd>
            </div>
            <div>
              <dt>Target profile</dt>
              <dd>
                {constraints.length === 0
                  ? 'None set; candidates were judged on generic drug-likeness.'
                  : constraints.map((c) => describeConstraint(c)).join(' · ')}
              </dd>
            </div>
          </dl>
        </>
      )

    case 'molecules': {
      const items = section.candidateIds
        .map((id) => ctx.byId.get(id))
        .filter((c): c is Candidate => c !== undefined)
      return (
        <>
          {section.caption && <p>{section.caption}</p>}
          <div className="rfigs">
            {section.includeFocus && ctx.focus && (
              <MoleculeFigure
                svg={ctx.focus.svg}
                image3d={knownImage3d(ctx.focus.properties.canonicalSmiles) ?? undefined}
                title={focusName ?? 'Focus molecule'}
                subtitle="Starting point"
              />
            )}
            {items.map((c) => (
              <MoleculeFigure
                key={c.id}
                svg={c.svg}
                image3d={ctx.images3d.get(c.properties.canonicalSmiles)}
                title={nameOf(c, ctx.ranked)}
                subtitle={shortName(c)}
              />
            ))}
          </div>
        </>
      )
    }

    case 'properties': {
      const items = section.candidateIds
        .map((id) => ctx.byId.get(id))
        .filter((c): c is Candidate => c !== undefined)
      const molecules = [
        ...(ctx.focus
          ? [
              {
                key: 'focus',
                label: focusName ?? 'Focus',
                properties: ctx.focus.properties,
              },
            ]
          : []),
        ...items.map((c) => ({
          key: c.id,
          label: nameOf(c, ctx.ranked),
          properties: c.properties,
        })),
      ]
      return (
        <>
          {section.caption && <p>{section.caption}</p>}
          <PropertyTable
            molecules={molecules}
            properties={section.properties ?? DEFAULT_PROPERTIES}
          />
        </>
      )
    }

    case 'comparison': {
      const items = section.candidateIds
        .map((id) => ctx.byId.get(id))
        .filter((c): c is Candidate => c !== undefined)
      return (
        <>
          {section.caption && <p>{section.caption}</p>}
          <div className="tablewrap">
            <table className="ctable">
              <thead>
                <tr>
                  <th className="ctable__corner">Property</th>
                  <th>{focusName ?? 'Focus'}</th>
                  {items.map((c) => (
                    <th key={c.id}>
                      <span className="ctable__colname">{nameOf(c, ctx.ranked)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEFAULT_PROPERTIES.map((key) => (
                  <tr key={key}>
                    <td className="ctable__name">{measureFor(key)?.label ?? String(key)}</td>
                    <td>{ctx.focus ? String(ctx.focus.properties[key]) : '—'}</td>
                    {items.map((c) => {
                      const d = deltaFor(key, c.properties, ctx.focus?.properties ?? null, constraints)
                      return (
                        <td key={c.id}>
                          <span className="ctable__val">{String(c.properties[key])}</span>
                          <DeltaValue delta={d} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )
    }

    case 'recommendation': {
      const c = ctx.byId.get(section.candidateId)
      if (!c) {
        return (
          <p className="warn">
            This section recommended a candidate that is no longer on the board.
          </p>
        )
      }
      return (
        <>
          <h3>Recommendation: {nameOf(c, ctx.ranked)}</h3>
          <div className="rrec">
            <MoleculeFigure
              svg={c.svg}
              image3d={ctx.images3d.get(c.properties.canonicalSmiles)}
              title={nameOf(c, ctx.ranked)}
              subtitle={shortName(c)}
            />
            <div>
              {section.body.split(/\n{2,}/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              <dl className="rkv">
                <div>
                  <dt>SMILES</dt>
                  <dd>
                    <code className="smiles">{c.properties.canonicalSmiles}</code>
                  </dd>
                </div>
                <div>
                  <dt>Key measures</dt>
                  <dd>
                    logS {c.properties.logS} · logP {c.properties.logP} · TPSA{' '}
                    {c.properties.tpsa} · SA {c.properties.saScore} · HIA {c.properties.hiaScore}%
                  </dd>
                </div>
                <div>
                  <dt>Rulesets</dt>
                  <dd>
                    {c.rules.passes
                      ? 'All four pass.'
                      : `${c.rules.failed.map((r) => r.name).join(', ')} fail.`}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </>
      )
    }

    case 'evolution': {
      const promotedIds = new Set<string>()
      let id: string | null = focusId
      while (id && !promotedIds.has(id)) {
        promotedIds.add(id)
        id = ctx.candidates.find((c) => c.id === id)?.parentId ?? null
      }
      const progress = briefProgress({
        candidates: ctx.candidates,
        promotedIds,
        usingGoals: constraints.length > 0,
      })
      const depth = generationMap(ctx.candidates)
      const generations = ctx.candidates.length
        ? Math.max(...ctx.candidates.map((c) => depth.get(c.id) ?? 1))
        : 0

      const series: LineSeries[] = [
        { name: 'Best in generation', color: SERIES_COLORS[0], points: progress.best },
      ]
      if (progress.promoted.some((p) => p !== null)) {
        series.push({
          name: 'Promoted',
          color: SERIES_COLORS[1],
          points: progress.promoted,
          dashed: true,
        })
      }

      return (
        <>
          <h3>How the series developed</h3>
          <p>
            {ctx.candidates.length} molecule{ctx.candidates.length === 1 ? '' : 's'} were designed
            across {generations} generation{generations === 1 ? '' : 's'}.
            {progress.latest !== null &&
              ` The best candidate meets ${Math.round(progress.latest * 100)}% of ${
                progress.measuring === 'goals' ? 'the target profile' : 'the drug-likeness rulesets'
              }.`}
          </p>
          {progress.labels.length > 0 && <LineChart labels={progress.labels} series={series} />}
        </>
      )
    }

    case 'ledger': {
      const ledger = buildLedger(ctx.candidates)
      if (ledger.hitRate === null) {
        return (
          <>
            <h3>Prediction accuracy</h3>
            <p>
              The agent stated no numbers ahead of computing them during this series, so there is
              nothing to check its chemistry intuition against.
            </p>
          </>
        )
      }
      return (
        <>
          <h3>Prediction accuracy</h3>
          <p>
            Where the agent committed to a value before it was computed, {ledger.within} of{' '}
            {ledger.attempts} predictions landed inside tolerance.
          </p>
          <div className="tablewrap">
            <table className="ctable">
              <thead>
                <tr>
                  <th className="ctable__corner">Property</th>
                  <th>Within tolerance</th>
                  <th>Mean error</th>
                  <th>Worst</th>
                </tr>
              </thead>
              <tbody>
                {ledger.fields.map((f) => (
                  <tr key={f.field}>
                    <td className="ctable__name">{f.label}</td>
                    <td>
                      {f.within}/{f.attempts}
                    </td>
                    <td>{f.meanAbsError}</td>
                    <td>{f.worst}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )
    }
  }
}

// --- editing -----------------------------------------------------------------

function SectionShell({
  section,
  index,
  total,
  ctx,
  editing,
}: {
  section: ReportSection
  index: number
  total: number
  ctx: Ctx
  editing: boolean
}) {
  const editSection = useWorkbench((s) => s.editSection)
  const removeSection = useWorkbench((s) => s.removeSection)
  const moveSection = useWorkbench((s) => s.moveSection)

  const prose =
    section.type === 'text' || section.type === 'recommendation' ? section.body : null

  return (
    <section className="rsection">
      {editing && (
        <div className="rsection__tools no-print">
          <StatusBadge label={SECTION_LABEL[section.type]} tone="neutral" />
          <span className="rsection__spacer" />
          <button
            className="btn btn--icon"
            onClick={() => moveSection(section.id, -1)}
            disabled={index === 0}
            title="Move up"
            aria-label="Move section up"
          >
            ↑
          </button>
          <button
            className="btn btn--icon"
            onClick={() => moveSection(section.id, 1)}
            disabled={index === total - 1}
            title="Move down"
            aria-label="Move section down"
          >
            ↓
          </button>
          <button
            className="btn btn--icon btn--danger"
            onClick={() => removeSection(section.id)}
            title="Remove section"
            aria-label="Remove section"
          >
            ×
          </button>
        </div>
      )}

      {editing && prose !== null ? (
        <>
          {section.type === 'text' && (
            <input
              className="rsection__heading"
              value={section.heading ?? ''}
              placeholder="Section heading (optional)"
              onChange={(e) => editSection(section.id, { heading: e.target.value })}
            />
          )}
          <textarea
            className="rsection__prose"
            value={prose}
            onChange={(e) => editSection(section.id, { body: e.target.value })}
          />
          <p className="hint no-print">
            Your edits replace the agent's words. Turn off Editing to see this section as it will
            print — the figures and numbers around it come from live data and are not editable.
          </p>
        </>
      ) : (
        <SectionBody section={section} ctx={ctx} />
      )}
    </section>
  )
}

// --- page --------------------------------------------------------------------

export function ReportPage({ ranked }: { ranked: Ranked[] }) {
  const report = useWorkbench((s) => s.report)
  const setReport = useWorkbench((s) => s.setReport)
  const setReportMeta = useWorkbench((s) => s.setReportMeta)
  const candidates = useWorkbench((s) => s.candidates)
  const focus = useWorkbench((s) => s.focus)
  const setPage = useWorkbench((s) => s.setPage)
  const note = useWorkbench((s) => s.note)
  const focusName = usePresetName(focus?.properties.canonicalSmiles ?? null)

  const [editing, setEditing] = useState(true)
  const [images3d, setImages3d] = useState<Map<string, string>>(new Map())
  const [capturing, setCapturing] = useState<string | null>(null)
  const paper = useRef<HTMLDivElement | null>(null)

  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])

  /** Every molecule the draft actually shows a picture of. */
  const figured = useMemo(() => {
    if (!report) return []
    const smiles = new Set<string>()
    for (const s of report.sections) {
      if (s.type === 'molecules') {
        if (s.includeFocus && focus) smiles.add(focus.properties.canonicalSmiles)
        for (const id of s.candidateIds) {
          const c = byId.get(id)
          if (c) smiles.add(c.properties.canonicalSmiles)
        }
      }
      if (s.type === 'recommendation') {
        const c = byId.get(s.candidateId)
        if (c) smiles.add(c.properties.canonicalSmiles)
      }
    }
    return [...smiles]
  }, [report, byId, focus])

  const ctx: Ctx = { candidates, byId, focus, ranked, images3d }

  const add3d = async () => {
    setCapturing('0 / ' + figured.length)
    const captured = await captureAll3d(figured, (done, total) =>
      setCapturing(`${done} / ${total}`),
    )
    setImages3d(captured)
    setCapturing(null)
    note({
      actor: 'human',
      tool: 'report_3d',
      detail: `${captured.size} of ${figured.length} molecules rendered`,
      ok: captured.size > 0,
    })
  }

  /**
   * Print and the HTML download both read the rendered DOM, and in editing
   * mode the prose lives in textareas -- which print as empty boxes and clone
   * without their value. So both flip to preview and wait for the repaint
   * before reading anything.
   */
  const asPreview = async (run: () => void) => {
    if (!editing) return run()
    setEditing(false)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    run()
  }

  const saveHtml = (r: Report) => {
    const html = buildReportHtml({
      report: r,
      paper: paper.current,
      subject: focusName ?? focus?.properties.canonicalSmiles ?? 'Untitled series',
    })
    download(`${slug(r.title)}.html`, html, 'text/html')
    note({ actor: 'human', tool: 'export_report', detail: 'HTML', ok: true })
  }

  const saveMarkdown = (r: Report) => {
    const md = buildReportMarkdown(r, ctx)
    download(`${slug(r.title)}.md`, md, 'text/markdown')
    note({ actor: 'human', tool: 'export_report', detail: 'Markdown', ok: true })
  }

  if (!report) {
    return (
      <div className="page">
        <div className="pagehead">
          <h1>Report</h1>
          <p>A document your agent drafts and you publish.</p>
        </div>
        <section className="surface">
          <EmptyState title="No draft yet." icon="✎">
            <p>Ask your agent for one, for example:</p>
            <ul className="steps">
              <li>
                <em>Write a report on the top three candidates, focused on solubility.</em>
              </li>
              <li>
                <em>Draft a series review with the evolution and your prediction accuracy.</em>
              </li>
              <li>
                <em>Make a one-page dossier on the current focus molecule.</em>
              </li>
            </ul>
            <p className="hint">
              The agent writes the judgement and picks the sections. Every number, structure and
              chart is rendered here from live data, so nothing in the document is a figure it
              remembered.
            </p>
            <button className="linkbtn" onClick={() => setPage('design')}>
              Back to the board →
            </button>
          </EmptyState>
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="pagehead no-print">
        <h1>Report</h1>
        <p>Drafted by your agent. Edit anything, drop what you do not want, then download.</p>
      </div>

      <section className="surface no-print">
        <SectionHead title="Export">
          <label className="toggle toggle--inline">
            <input
              type="checkbox"
              checked={editing}
              onChange={(e) => setEditing(e.target.checked)}
            />
            <span>Editing</span>
          </label>
        </SectionHead>

        <div className="chips">
          <button className="btn btn--primary" onClick={() => void asPreview(() => window.print())}>
            Print / Save as PDF
          </button>
          <button className="btn" onClick={() => void asPreview(() => saveHtml(report))}>
            Download HTML
          </button>
          <button className="btn" onClick={() => saveMarkdown(report)}>
            Download Markdown
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => void add3d()}
            disabled={capturing !== null || figured.length === 0}
            title="Renders each figured molecule in 3D and embeds it"
          >
            {capturing ? `Rendering 3D ${capturing}…` : 'Add 3D structures'}
          </button>
          <button
            className="btn btn--danger"
            onClick={() => {
              if (confirm('Discard this draft? Your agent can write another.')) setReport(null)
            }}
          >
            Discard draft
          </button>
        </div>
        {figured.length > 0 && images3d.size === 0 && (
          <p className="hint">
            {figured.length} molecule{figured.length === 1 ? '' : 's'} in this report can carry a
            3D structure. Rendering them fetches coordinates from a public NIH service.
          </p>
        )}
      </section>

      {/* Everything inside .paper is what gets printed and downloaded. */}
      <article className="surface paper" ref={paper}>
        <header className="paper__head">
          {editing ? (
            <>
              <input
                className="paper__titleinput no-print"
                value={report.title}
                onChange={(e) => setReportMeta({ title: e.target.value })}
                placeholder="Report title"
              />
              <input
                className="paper__subtitleinput no-print"
                value={report.subtitle ?? ''}
                onChange={(e) => setReportMeta({ subtitle: e.target.value })}
                placeholder="Subtitle (optional)"
              />
            </>
          ) : (
            <>
              <h1>{report.title}</h1>
              {report.subtitle && <p className="paper__subtitle">{report.subtitle}</p>}
            </>
          )}
          <p className="paper__meta">
            {focusName ?? focus?.properties.canonicalSmiles ?? 'No focus molecule'} ·{' '}
            {new Date(report.createdAt).toLocaleString()} · drafted by the agent, published by you
          </p>
        </header>

        {report.sections.length === 0 ? (
          <EmptyState title="Every section was removed.">
            <p>Ask the agent to draft another, or discard this one.</p>
          </EmptyState>
        ) : (
          report.sections.map((section, i) => (
            <SectionShell
              key={section.id}
              section={section}
              index={i}
              total={report.sections.length}
              ctx={ctx}
              editing={editing}
            />
          ))
        )}

        <footer className="paper__foot">
          <p>
            Structures and properties computed locally with RDKit. Values are labelled exact,
            computed or estimated in the workbench; logS and shape descriptors are estimates with
            roughly a log unit and one conformer of uncertainty respectively. 3D coordinates,
            where shown, come from NCI CACTUS or PubChem. The narrative is the agent's; the
            numbers are not.
          </p>
        </footer>
      </article>
    </div>
  )
}

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'report'
