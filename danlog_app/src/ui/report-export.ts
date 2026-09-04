import type { Candidate, Molecule } from '../store/workbench'
import type { Report } from '../chem/report'
import { measureFor } from '../chem/measures'

/**
 * Getting the report out of the browser.
 *
 * Two routes, both dependency-free. Print hands the page to the browser's own
 * typesetter, which produces a better PDF than any library we could ship for
 * a fraction of a megabyte. The HTML download clones what is on screen into a
 * single self-contained file -- structures are already SVG and 3D captures are
 * already data URIs, so the result opens anywhere, offline, forever.
 *
 * Both read the rendered DOM, which is why the page must be in preview rather
 * than editing when either is called: a <textarea> clones as an empty box.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Agent prose is untrusted text; it is escaped, never parsed as markup. */
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => ESCAPES[ch])

/**
 * Styling for the standalone file. Written out rather than scraped from the
 * page: the app's stylesheet is built for a workspace with a sidebar, and a
 * document wants different margins, a serif measure and no interaction.
 */
const DOCUMENT_CSS = `
:root {
  --ink: #191c27;
  --soft: #4b5162;
  --muted: #757c8e;
  --line: #e2e5ee;
  --accent: #5947b8;
  --ok: #0f9d76;
  --bad: #d92d20;
  --warn: #c2760a;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 48px 32px 80px;
  background: #fff;
  color: var(--ink);
  font: 15px/1.62 ui-serif, Georgia, "Times New Roman", serif;
  -webkit-font-smoothing: antialiased;
}
.paper { max-width: 46rem; margin: 0 auto; }
h1 { font-size: 30px; line-height: 1.2; margin: 0 0 6px; letter-spacing: -0.015em; }
h2, h3 {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 15px;
  letter-spacing: 0.02em;
  margin: 34px 0 10px;
}
p { margin: 0 0 12px; }
code, .smiles {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  color: var(--muted);
  word-break: break-all;
}
.paper__subtitle { font-size: 17px; color: var(--soft); margin: 0 0 10px; }
.paper__meta, .paper__foot {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 11.5px;
  color: var(--muted);
}
.paper__head { border-bottom: 2px solid var(--ink); padding-bottom: 14px; margin-bottom: 8px; }
.paper__foot { border-top: 1px solid var(--line); margin-top: 40px; padding-top: 14px; }
.rsection { margin: 0 0 26px; }
.rfigs { display: flex; flex-wrap: wrap; gap: 18px; margin: 14px 0; }
.rfig { margin: 0; flex: 1 1 210px; max-width: 300px; }
.rfig__views { display: flex; gap: 8px; align-items: stretch; }
.rfig__views > * { flex: 1; min-width: 0; }
.depiction, .rfig__3d {
  display: block;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  padding: 4px;
}
.depiction svg, .rfig__3d { max-width: 100%; height: auto; }
figcaption {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 11.5px;
  margin-top: 6px;
  display: flex;
  flex-direction: column;
}
figcaption strong { color: var(--ink); }
figcaption span { color: var(--muted); }
table {
  width: 100%;
  border-collapse: collapse;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  margin: 12px 0;
}
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); }
thead th { border-bottom: 1.5px solid var(--ink); font-size: 11px; }
.ctable__name { color: var(--muted); }
.ctable__val { font-weight: 600; margin-right: 6px; }
.delta { font-size: 11px; font-weight: 600; }
.delta--good { color: var(--ok); }
.delta--bad { color: var(--bad); }
.delta--flat, .delta--none { color: var(--muted); }
.rkv { margin: 12px 0; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12.5px; }
.rkv > div { display: flex; gap: 14px; padding: 6px 0; border-top: 1px solid var(--line); }
.rkv dt { flex: none; min-width: 132px; color: var(--muted); }
.rkv dd { margin: 0; color: var(--soft); }
.rrec { display: flex; gap: 20px; align-items: flex-start; }
.rrec > div:last-child { flex: 1; min-width: 0; }
.linechart { max-width: 460px; }
.linechart__grid { stroke: var(--line); }
.linechart__tick { font-size: 9px; fill: var(--muted); }
.linechart__line { fill: none; stroke-width: 2; }
.linechart__line--dashed { stroke-dasharray: 4 3; }
.warn { color: var(--warn); }
.badge { display: none; }
@media print {
  body { padding: 0; }
  .rsection { break-inside: avoid; }
  .rfig { break-inside: avoid; }
  table { break-inside: avoid; }
}
`

/**
 * A self-contained copy of what is on screen.
 *
 * The clone is scrubbed of anything that only makes sense in the app: the
 * editing chrome, and any form control that happens to have survived.
 */
export function buildReportHtml({
  report,
  paper,
  subject,
}: {
  report: Report
  paper: HTMLElement | null
  subject: string
}): string {
  const body = (() => {
    if (!paper) return '<p>Nothing to export.</p>'
    const clone = paper.cloneNode(true) as HTMLElement

    clone.querySelectorAll('.no-print').forEach((node) => node.remove())
    // A control in a document is furniture that does nothing.
    clone.querySelectorAll('input, textarea, select, button').forEach((node) => node.remove())
    clone.removeAttribute('class')

    return clone.innerHTML
  })()

  const title = escapeHtml(report.title)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${escapeHtml(report.subtitle ?? `Molecular design report for ${subject}`)}">
<meta name="generator" content="ANALOG molecule design workbench">
<style>${DOCUMENT_CSS}</style>
</head>
<body>
<article class="paper">
${body}
</article>
</body>
</html>
`
}

// --- markdown ----------------------------------------------------------------

type MarkdownContext = {
  candidates: Candidate[]
  byId: Map<string, Candidate>
  focus: Molecule | null
}

const PROPS = ['mw', 'logP', 'tpsa', 'logS', 'saScore', 'hiaScore'] as const

/**
 * The plain-text version, for pasting somewhere else. Structures cannot come
 * along, so each molecule carries its SMILES instead -- which is the form
 * every other cheminformatics tool can actually read back.
 */
export function buildReportMarkdown(report: Report, ctx: MarkdownContext): string {
  const out: string[] = [`# ${report.title}`]
  if (report.subtitle) out.push(`_${report.subtitle}_`)
  out.push(`Generated ${new Date(report.createdAt).toLocaleString()} · drafted by the agent, published by a human.`)

  const label = (c: Candidate) => c.rationale.split(/[.;\n]/)[0]?.trim() || 'Proposed analog'

  const table = (molecules: { name: string; c: Candidate | Molecule }[]) => {
    const head = `| Property | ${molecules.map((m) => m.name).join(' | ')} |`
    const rule = `| --- | ${molecules.map(() => '---').join(' | ')} |`
    const rows = PROPS.map((key) => {
      const cells = molecules.map((m) => String(m.c.properties[key]))
      return `| ${measureFor(key)?.label ?? key} | ${cells.join(' | ')} |`
    })
    return [head, rule, ...rows].join('\n')
  }

  for (const section of report.sections) {
    switch (section.type) {
      case 'text':
        if (section.heading) out.push(`## ${section.heading}`)
        out.push(section.body)
        break

      case 'recommendation': {
        const c = ctx.byId.get(section.candidateId)
        out.push(`## Recommendation${c ? `: ${label(c)}` : ''}`)
        out.push(section.body)
        if (c) {
          out.push(`\`${c.properties.canonicalSmiles}\``)
          out.push(
            `logS ${c.properties.logS} · logP ${c.properties.logP} · TPSA ${c.properties.tpsa} · SA ${c.properties.saScore} · HIA ${c.properties.hiaScore}%`,
          )
        }
        break
      }

      case 'molecules': {
        out.push('## Structures')
        if (section.caption) out.push(section.caption)
        for (const id of section.candidateIds) {
          const c = ctx.byId.get(id)
          if (c) out.push(`- **${label(c)}** — \`${c.properties.canonicalSmiles}\``)
        }
        break
      }

      case 'properties':
      case 'comparison': {
        out.push(section.type === 'comparison' ? '## Comparison' : '## Properties')
        if (section.caption) out.push(section.caption)
        const molecules = [
          ...(ctx.focus ? [{ name: 'Focus', c: ctx.focus as Molecule }] : []),
          ...section.candidateIds
            .map((id) => ctx.byId.get(id))
            .filter((c): c is Candidate => c !== undefined)
            .map((c) => ({ name: label(c), c })),
        ]
        if (molecules.length > 0) out.push(table(molecules))
        break
      }

      case 'brief':
        out.push('## Design brief')
        out.push(
          ctx.focus
            ? `Starting molecule: \`${ctx.focus.properties.canonicalSmiles}\``
            : 'No focus molecule was loaded.',
        )
        break

      case 'evolution':
        out.push('## How the series developed')
        out.push(`${ctx.candidates.length} molecules were designed in this series.`)
        break

      case 'ledger':
        out.push('## Prediction accuracy')
        out.push("How often the agent's stated numbers survived checking. See the full report.")
        break
    }
  }

  out.push(
    '\n---\nStructures and properties computed locally with RDKit. logS is an estimate with ' +
      "roughly a log unit of error. The narrative is the agent's; the numbers are not.",
  )

  return out.join('\n\n')
}
