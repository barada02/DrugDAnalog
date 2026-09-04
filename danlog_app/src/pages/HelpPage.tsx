import { useWorkbench, type Page } from '../store/workbench'
import { NOT_COMPUTABLE, TIER_ABOUT } from '../chem/measures'
import { SectionHead, Row } from '../ui/primitives'
import { TierLegend } from '../ui/molecule'

/**
 * Help, written as documentation rather than a tour.
 *
 * It is the only page that explains the ideas the rest of the app assumes you
 * already hold: what a focus molecule is for, why a candidate waits on you,
 * and why every number carries a confidence tier. One page with contents at
 * the top, because someone looking something up does not want a wizard.
 */

const TOPICS: { id: string; label: string }[] = [
  { id: 'what', label: 'What this is' },
  { id: 'loop', label: 'The design loop' },
  { id: 'pages', label: 'The pages' },
  { id: 'concepts', label: 'Concepts' },
  { id: 'agent', label: 'Working with the agent' },
  { id: 'reports', label: 'Reports' },
  { id: 'trust', label: 'Trusting a number' },
  { id: 'privacy', label: 'What leaves your machine' },
  { id: 'limits', label: 'What it will not do' },
]

export function HelpPage() {
  const setPage = useWorkbench((s) => s.setPage)
  const go = (page: Page) => () => setPage(page)

  return (
    <div className="page doc">
      <div className="pagehead">
        <h1>Documentation</h1>
        <p>How this workbench works, and the ideas it assumes.</p>
      </div>

      <nav className="doctoc" aria-label="Contents">
        {TOPICS.map((t) => (
          <a key={t.id} href={`#${t.id}`}>
            {t.label}
          </a>
        ))}
      </nav>

      <section className="surface" id="what">
        <SectionHead title="What this is" />
        <p>
          A workbench for designing molecular analogs with an AI agent, where the chemistry is
          computed rather than recalled. You set a starting molecule and a brief; the agent
          proposes analogs; RDKit measures every one of them in your browser; you decide what
          advances.
        </p>
        <p className="doc__lead">
          The point of the app is the line between what a model <em>claims</em> and what a
          computation <em>measures</em>. An agent will state a molecular weight and a predicted
          solubility with identical confidence, though one is addition and the other is a
          regression with a log unit of error. The confidence tiers, the prediction ledger and the
          way reports are built all exist to keep that line visible.
        </p>
        <Row label="Nothing is automatic">
          An agent can only ever propose. Accepting a candidate, promoting one to focus, fetching
          3D coordinates and downloading a report are human acts, and no tool can reach them.
        </Row>
      </section>

      <section className="surface" id="loop">
        <SectionHead title="The design loop" />
        <ol className="steps">
          <li>
            <strong>Set a focus molecule.</strong> The thing you are improving on. Pick a preset or
            paste a SMILES on the{' '}
            <button className="linkbtn" onClick={go('design')}>
              Design page
            </button>
            . Everything else is measured relative to it.
          </li>
          <li>
            <strong>State the brief.</strong> A design goal in plain words, a target profile of
            numeric constraints, and any functional group you insist on keeping. Use{' '}
            <em>Edit brief</em> under the focus molecule.
          </li>
          <li>
            <strong>Let the agent propose.</strong> Analogs arrive as pending candidates, ranked,
            each labelled with why it is interesting.
          </li>
          <li>
            <strong>Inspect and compare.</strong> The card says why a molecule is worth attention;
            the inspector holds the evidence; Compare puts several side by side.
          </li>
          <li>
            <strong>Decide.</strong> Accept, reject, shortlist or delete. Accepting says the idea is
            sound; <em>Make focus molecule</em> says the next generation comes from it.
          </li>
          <li>
            <strong>Repeat.</strong> Each promotion starts a generation, and Evolution records the
            path taken.
          </li>
        </ol>
      </section>

      <section className="surface" id="pages">
        <SectionHead title="The pages" />
        <div className="doccards">
          <article>
            <h3>Overview</h3>
            <p>
              Where the project stands and what is blocking you: pending decisions, gaps in the
              brief, progress toward your target profile, recent activity, and how often the
              agent's own predictions have been right.
            </p>
            <button className="linkbtn" onClick={go('overview')}>
              Open Overview →
            </button>
          </article>

          <article>
            <h3>Design</h3>
            <p>
              The main workspace. Focus molecule and brief at the top, generated analogs below,
              ranked and labelled. This is where the work happens.
            </p>
            <button className="linkbtn" onClick={go('design')}>
              Open Design →
            </button>
          </article>

          <article>
            <h3>Explore</h3>
            <p>
              Everything that has ever been on the board, with filters by status, generation,
              ruleset, preserved group and synthetic accessibility. For digging, not deciding.
            </p>
            <button className="linkbtn" onClick={go('explore')}>
              Open Explore →
            </button>
          </article>

          <article>
            <h3>Compare</h3>
            <p>
              Two to five molecules against the focus, with a delta-marked table, a profile radar
              and written insights. Stage one with the ⇄ button on any card.
            </p>
            <button className="linkbtn" onClick={go('compare')}>
              Open Compare →
            </button>
          </article>

          <article>
            <h3>Evolution</h3>
            <p>
              The design tree as a graph: every molecule joined to the ones designed from it, with
              the promoted path as the spine. Plus how the board converged on your brief.
            </p>
            <button className="linkbtn" onClick={go('evolution')}>
              Open Evolution →
            </button>
          </article>

          <article>
            <h3>Report</h3>
            <p>
              A document your agent drafts and you publish. Ask for one, edit it, download it as a
              PDF, a self-contained HTML file or Markdown.
            </p>
            <button className="linkbtn" onClick={go('report')}>
              Open Report →
            </button>
          </article>
        </div>
      </section>

      <section className="surface" id="concepts">
        <SectionHead title="Concepts" />

        <Row label="Focus molecule">
          The molecule everything is measured against. Every arrow on a card is a change relative
          to it. Promoting a candidate makes it the new focus and starts a generation.
        </Row>
        <Row label="Candidate states">
          <strong>Generated</strong> — proposed, undecided. <strong>Shortlisted</strong> — starred
          for later, without a decision. <strong>Accepted</strong> — you approve of it.{' '}
          <strong>Rejected</strong> — turned down, kept on the board as a record.{' '}
          <strong>Deleted</strong> — removed entirely. Prefer reject unless it should never have
          existed.
        </Row>
        <Row label="Generations">
          Generation 1 is everything designed from the starting molecule; each promotion adds a
          level. The G1/G2 tag on a card and the columns on Evolution are the same number.
        </Row>
        <Row label="Preserve (pinned group)">
          A functional group that must survive every proposal. Candidates are checked against it
          and the agent is told when one broke the promise. Only groups the focus molecule
          actually contains can be pinned.
        </Row>
        <Row label="Target profile">
          Numeric constraints — the brief made checkable. Deliberately not a published
          drug-likeness score: it is whatever you asked for, scored honestly. Progress on Overview
          and Evolution is measured against it.
        </Row>
        <Row label="Rulesets">
          Lipinski, Veber, Egan and Pfizer 3/75. Guidance, not law — plenty of marketed drugs break
          them. Their value is naming the specific clause that failed.
        </Row>
        <Row label="SA score">
          Synthetic accessibility, 0 to 10, where <strong>lower is easier</strong>. Under 3 is
          comfortable; over 6.5 needs specialist work. Estimated from molecular complexity, not
          from a retrosynthesis search — no route is proposed here.
        </Row>
        <Row label="Diversity">
          Mean pairwise distance across the surviving board. Below 0.3 means the agent is producing
          variations on one idea rather than separate ideas.
        </Row>
        <Row label="Similarity to parent">
          Tanimoto over Morgan fingerprints. It catches an agent that claims a small change and
          then hands you a different chemotype.
        </Row>
      </section>

      <section className="surface" id="agent">
        <SectionHead title="Working with the agent" />
        <p>
          The agent reaches this page through WebMCP: the app registers tools on the document and
          the agent calls them. It can read the board, compute properties, check substructures,
          suggest bioisosteres, propose candidates and draft reports. It cannot accept, promote or
          download.
        </p>
        <h3>Worth asking for</h3>
        <ul className="steps">
          <li>
            <em>Propose three more soluble analogs, and predict logP before you compute it.</em>
          </li>
          <li>
            <em>Keep the amide. Anything that loses it is a failed proposal.</em>
          </li>
          <li>
            <em>Which of these is realistically easiest to make?</em>
          </li>
          <li>
            <em>Suggest bioisosteres for the carboxylic acid and explain the trade-off.</em>
          </li>
          <li>
            <em>Write a report on the top three candidates, focused on solubility.</em>
          </li>
        </ul>
        <p className="hint">
          Asking for a prediction <em>before</em> the measurement is what fills the prediction
          ledger. It is the only honest way to find out whether the agent's chemistry intuition is
          any good, and it costs nothing to ask.
        </p>
        <p className="hint">
          If the agent cannot see the tools, the developer trace in the top bar says why. WebMCP is
          experimental and currently needs a flag in Chrome.
        </p>
      </section>

      <section className="surface" id="reports">
        <SectionHead title="Reports" />
        <p>
          Ask the agent for a report and it drafts one on the{' '}
          <button className="linkbtn" onClick={go('report')}>
            Report page
          </button>
          , choosing the sections and writing the prose. You edit anything, reorder or drop
          sections, then download.
        </p>
        <Row label="What the agent writes">
          The narrative, the reasoning and the recommendation — the judgement.
        </Row>
        <Row label="What the app writes">
          Every number, table, structure and chart, rendered from live state at the moment you
          export. The agent references molecules by id; it never types a value into the document.
        </Row>
        <Row label="Images">
          2D structures come from RDKit as vector graphics, so they stay sharp at any size. 3D is
          optional — <em>Add 3D structures</em> renders each molecule and embeds it, fetching
          coordinates for any that does not have them yet.
        </Row>
        <Row label="Formats">
          <strong>Print / Save as PDF</strong> uses the browser's own typesetter.{' '}
          <strong>HTML</strong> is one self-contained file that opens offline.{' '}
          <strong>Markdown</strong> carries the text and SMILES for pasting elsewhere.
        </Row>
      </section>

      <section className="surface" id="trust">
        <SectionHead title="Trusting a number" />
        <p>
          Every measure is labelled with how it was arrived at. This distinction is what makes the
          workbench worth using instead of asking a model directly.
        </p>
        <Row label="Exact">{TIER_ABOUT.exact}</Row>
        <Row label="Computed">{TIER_ABOUT.computed}</Row>
        <Row label="Estimated">{TIER_ABOUT.estimated}</Row>
        <TierLegend />
        <p className="hint">
          In practice: molecular weight and atom counts are arithmetic. logP and TPSA are published
          algorithms. logS carries roughly a log unit of error either way, so read it as a
          direction of travel rather than a measurement. Shape descriptors are exact for the one
          conformer they came from, which is not the only conformer the molecule adopts.
        </p>
      </section>

      <section className="surface" id="privacy">
        <SectionHead title="What leaves your machine" />
        <p>
          Every calculation runs locally through RDKit compiled to WebAssembly. Two things are
          exceptions, both to public NIH services:
        </p>
        <Row label="3D coordinates">
          Fetched per molecule when a structure is shown in 3D. RDKit's browser build cannot
          generate conformers, so there is no local alternative.
        </Row>
        <Row label="Systematic names">
          Fetched to name cards and headings. Can be turned off in{' '}
          <button className="linkbtn" onClick={go('settings')}>
            Settings
          </button>
          , after which no structure is sent for naming.
        </Row>
        <p className="hint">
          Your session is stored only in this browser's localStorage, and only as SMILES and
          decisions — everything else is recomputed on load.
        </p>
      </section>

      <section className="surface" id="limits">
        <SectionHead title="What it will not do" />
        <p className="hint">
          These need a lab, a protein structure or a trained model. Asking for one returns a refusal
          rather than a number, deliberately: a plausible figure with nothing behind it is worse
          than no figure.
        </p>
        <div className="notcomputable">
          {Object.entries(NOT_COMPUTABLE).map(([key, why]) => (
            <Row key={key} label={key}>
              {why}
            </Row>
          ))}
        </div>
      </section>
    </div>
  )
}
