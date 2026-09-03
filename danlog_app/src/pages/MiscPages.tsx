import { useWorkbench } from '../store/workbench'
import { PRESETS } from '../chem/properties'
import { NOT_COMPUTABLE, TIER_ABOUT } from '../chem/measures'
import { download, toCsv, toSmiles } from '../chem/export'
import { SectionHead, StatusBadge, Row } from '../ui/primitives'
import { TierLegend } from '../ui/molecule'

export function SettingsPage({ tools }: { tools: string[] }) {
  const rdkitStatus = useWorkbench((s) => s.rdkitStatus)
  const rdkitError = useWorkbench((s) => s.rdkitError)
  const candidates = useWorkbench((s) => s.candidates)
  const reset = useWorkbench((s) => s.reset)
  const setTraceOpen = useWorkbench((s) => s.setTraceOpen)

  return (
    <div className="page">
      <div className="pagehead">
        <h1>Settings</h1>
        <p>What is running, what leaves your machine, and how to start over.</p>
      </div>

      <section className="surface">
        <SectionHead title="Runtime" />
        <Row label="RDKit">
          <StatusBadge
            label={rdkitStatus}
            tone={rdkitStatus === 'ready' ? 'ok' : rdkitStatus === 'error' ? 'bad' : 'warn'}
          />
        </Row>
        <Row label="WebMCP tools">
          <StatusBadge
            label={tools.length ? `${tools.length} connected` : 'unavailable'}
            tone={tools.length ? 'ok' : 'bad'}
          />
        </Row>
        {rdkitError && <p className="error">{rdkitError}</p>}
        <p className="hint">
          <button className="linkbtn" onClick={() => setTraceOpen(true)}>
            Open the developer trace →
          </button>
        </p>
      </section>

      <section className="surface">
        <SectionHead title="Privacy" />
        <p className="hint">
          Every calculation on this page runs locally in your browser through RDKit compiled to
          WebAssembly. The one exception is 3D coordinates, which are fetched per molecule from a
          public NIH service (CACTUS, falling back to PubChem) when you open the Synthesis tab.
          Nothing else is sent anywhere, and the session is stored only in this browser's
          localStorage.
        </p>
      </section>

      <section className="surface">
        <SectionHead title="Confidence tiers" />
        <p className="hint">
          Every number in this app is labelled with how much to trust it. That distinction is the
          reason to prefer this to asking a model directly.
        </p>
        <Row label="Exact">{TIER_ABOUT.exact}</Row>
        <Row label="Computed">{TIER_ABOUT.computed}</Row>
        <Row label="Estimated">{TIER_ABOUT.estimated}</Row>
        <TierLegend />
      </section>

      <section className="surface">
        <SectionHead title="Session" />
        <div className="chips">
          <button
            className="btn btn--ghost"
            disabled={candidates.length === 0}
            onClick={() => download('analog-board.csv', toCsv(candidates), 'text/csv')}
          >
            Export CSV
          </button>
          <button
            className="btn btn--ghost"
            disabled={candidates.length === 0}
            onClick={() =>
              download('analog-board.smi', toSmiles(candidates), 'chemical/x-daylight-smiles')
            }
          >
            Export SMILES
          </button>
          <button
            className="btn btn--danger"
            onClick={() => {
              if (confirm('Clear the board and the saved session? This cannot be undone.')) {
                reset()
                void useWorkbench.getState().setFocus(PRESETS[0].smiles)
              }
            }}
          >
            Clear board and session
          </button>
        </div>
      </section>
    </div>
  )
}

export function HelpPage() {
  const setPage = useWorkbench((s) => s.setPage)

  return (
    <div className="page">
      <div className="pagehead">
        <h1>Help</h1>
        <p>How this workbench is meant to be used.</p>
      </div>

      <section className="surface">
        <SectionHead title="The loop" />
        <ol className="steps">
          <li>
            <strong>Set a focus molecule.</strong> The thing you are improving on. Pick a preset or
            paste a SMILES on the{' '}
            <button className="linkbtn" onClick={() => setPage('design')}>
              Design page
            </button>
            .
          </li>
          <li>
            <strong>State the brief.</strong> A design goal in plain words, a target profile of
            numeric constraints, and any group you insist on preserving.
          </li>
          <li>
            <strong>Let the agent propose.</strong> It can only ever create proposals. Nothing
            becomes the focus molecule without you clicking.
          </li>
          <li>
            <strong>Inspect and compare.</strong> The card says why a candidate is interesting; the
            drawer holds the evidence; Compare puts them side by side.
          </li>
          <li>
            <strong>Make focus molecule.</strong> That advances the design and starts the next
            generation. Evolution records the path.
          </li>
        </ol>
      </section>

      <section className="surface">
        <SectionHead title="Ask your agent for" />
        <ul className="steps">
          <li>
            <em>Propose three more soluble paracetamol analogs, and predict logP before you
            compute it.</em>
          </li>
          <li>
            <em>Keep the amide. Anything that loses it is a failed proposal.</em>
          </li>
          <li>
            <em>Which of these is easiest to actually make?</em>
          </li>
        </ul>
        <p className="hint">
          Asking for a prediction before the measurement is what fills the prediction ledger on
          the Overview page. It is the only honest way to find out whether the agent's chemistry
          intuition is any good.
        </p>
      </section>

      <section className="surface">
        <SectionHead title="What this app will not do" />
        <p className="hint">
          These need a lab, a protein structure, or a trained model. Asking for them returns a
          refusal rather than a number, on purpose.
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
