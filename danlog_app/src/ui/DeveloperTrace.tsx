import { useWorkbench } from '../store/workbench'
import { TOOL_NAMES } from '../mcp/tools'
import { Drawer, EmptyState, StatusBadge } from './primitives'

/**
 * Everything the old header shouted at the chemist, moved behind one button.
 *
 * Nothing is removed: the call log, the RDKit load state and the WebMCP failure
 * text all still exist and are all still accurate. They are simply no longer
 * the first thing a person sees when they open a molecular design tool.
 */
export function DeveloperTrace({ tools, mcpError }: { tools: string[]; mcpError: string | null }) {
  const open = useWorkbench((s) => s.traceOpen)
  const setOpen = useWorkbench((s) => s.setTraceOpen)
  const log = useWorkbench((s) => s.log)
  const rdkitStatus = useWorkbench((s) => s.rdkitStatus)
  const rdkitError = useWorkbench((s) => s.rdkitError)

  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      title="Developer trace"
      subtitle="Agent activity and runtime diagnostics. Not part of the design workflow."
    >
      <section className="trace__block">
        <h3>Runtime</h3>
        <div className="pills">
          <div className="pills__row">
            <span className="pills__name">RDKit</span>
            <StatusBadge
              label={rdkitStatus}
              tone={rdkitStatus === 'ready' ? 'ok' : rdkitStatus === 'error' ? 'bad' : 'warn'}
            />
          </div>
          <div className="pills__row">
            <span className="pills__name">WebMCP</span>
            <StatusBadge
              label={tools.length ? `${tools.length} tools` : 'unavailable'}
              tone={tools.length ? 'ok' : 'bad'}
            />
          </div>
        </div>
        {rdkitError && <p className="error">RDKit failed to load: {rdkitError}</p>}
        {mcpError && <p className="warn">{mcpError}</p>}
      </section>

      <section className="trace__block">
        <h3>Registered tools</h3>
        {tools.length > 0 ? (
          <p className="trace__tools">
            {tools.map((name) => (
              <code key={name}>{name}</code>
            ))}
          </p>
        ) : (
          <>
            <p className="hint">None registered. The agent cannot drive this board.</p>
            <p className="trace__tools trace__tools--muted">
              {TOOL_NAMES.map((name) => (
                <code key={name}>{name}</code>
              ))}
            </p>
          </>
        )}
      </section>

      <section className="trace__block">
        <h3>Call log</h3>
        {log.length === 0 ? (
          <EmptyState title="Nothing recorded yet.">
            <p className="hint">Every tool call, by you or the agent, lands here.</p>
          </EmptyState>
        ) : (
          <ul className="log">
            {log.map((entry) => (
              <li key={entry.id} className={'log__entry' + (entry.ok ? '' : ' log__entry--fail')}>
                <span className="log__actor">
                  [{entry.actor}] {entry.tool}
                </span>
                <span className="log__detail">{entry.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Drawer>
  )
}
