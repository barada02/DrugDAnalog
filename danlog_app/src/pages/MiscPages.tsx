import { useWorkbench } from '../store/workbench'
import { PRESETS } from '../chem/properties'
import { TIER_ABOUT } from '../chem/measures'
import { download, toCsv, toSmiles } from '../chem/export'
import { SectionHead, StatusBadge, Row } from '../ui/primitives'
import { TierLegend } from '../ui/molecule'

export function SettingsPage({ tools }: { tools: string[] }) {
  const rdkitStatus = useWorkbench((s) => s.rdkitStatus)
  const rdkitError = useWorkbench((s) => s.rdkitError)
  const candidates = useWorkbench((s) => s.candidates)
  const reset = useWorkbench((s) => s.reset)
  const setTraceOpen = useWorkbench((s) => s.setTraceOpen)
  const iupacLookup = useWorkbench((s) => s.iupacLookup)
  const setIupacLookup = useWorkbench((s) => s.setIupacLookup)

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
          WebAssembly. Two things are exceptions, and both send the structure to a public NIH
          service (CACTUS, falling back to PubChem for coordinates):
        </p>
        <Row label="3D coordinates">
          Fetched per molecule when a structure is shown in 3D. RDKit's browser build cannot
          generate conformers, so there is no local alternative.
        </Row>
        <Row label="Systematic names">
          Fetched per molecule to name cards and headings. Naming is a rule engine that does not
          ship to WebAssembly. Optional — turn it off below and no structure is sent for naming.
        </Row>
        <label className="toggle">
          <input
            type="checkbox"
            checked={iupacLookup}
            onChange={(e) => setIupacLookup(e.target.checked)}
          />
          <span>
            Look up systematic names
            <em>
              {iupacLookup
                ? 'On — each new molecule is sent once per session.'
                : 'Off — cards fall back to the agent’s own description.'}
            </em>
          </span>
        </label>
        <p className="hint">
          Nothing else leaves the browser, and the session is stored only in this browser's
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

