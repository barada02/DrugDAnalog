import { useState } from 'react'
import { describeConstraint, FIELD_LABELS, SCAFFOLD_PRESETS } from '../chem/constraints'
import type { NumericField } from '../chem/constraints'
import { matchSmarts } from '../chem/substructure'
import { useWorkbench } from '../store/workbench'

const NUMERIC_FIELDS = Object.keys(FIELD_LABELS) as NumericField[]

/**
 * The human states the hard rules here. Everything an agent proposes is checked
 * against this list, so this panel is what gives the app something to reject on.
 */
export function ConstraintEditor() {
  const constraints = useWorkbench((s) => s.constraints)
  const addConstraint = useWorkbench((s) => s.addConstraint)
  const removeConstraint = useWorkbench((s) => s.removeConstraint)
  const note = useWorkbench((s) => s.note)

  const [field, setField] = useState<NumericField>('logP')
  const [bound, setBound] = useState<'max' | 'min'>('max')
  const [value, setValue] = useState('3')
  const [smarts, setSmarts] = useState('')
  const [smartsError, setSmartsError] = useState<string | null>(null)

  const alreadyPreserved = (pattern: string) =>
    constraints.some((c) => (c.kind === 'preserve' || c.kind === 'forbid') && c.smarts === pattern)

  const addScaffold = (label: string, pattern: string) => {
    if (alreadyPreserved(pattern)) return
    addConstraint({ kind: 'preserve', smarts: pattern, label })
    note({ actor: 'human', tool: 'add_constraint', detail: 'keep ' + label, ok: true })
  }

  const addCustomSmarts = async () => {
    const pattern = smarts.trim()
    if (!pattern) return
    try {
      // Round-trips through RDKit so an unparseable pattern is caught here
      // rather than silently never matching anything.
      await matchSmarts('c1ccccc1', pattern)
    } catch {
      setSmartsError('RDKit could not parse that SMARTS pattern.')
      return
    }
    setSmartsError(null)
    if (!alreadyPreserved(pattern)) addConstraint({ kind: 'preserve', smarts: pattern, label: pattern })
    setSmarts('')
  }

  const addNumeric = () => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    addConstraint({ kind: bound, field, value: parsed })
    note({
      actor: 'human',
      tool: 'add_constraint',
      detail: FIELD_LABELS[field] + ' ' + bound + ' ' + parsed,
      ok: true,
    })
  }

  return (
    <div className="constraints">
      <h3>Hard constraints</h3>

      <p className="hint">Keep a scaffold:</p>
      <div className="presets">
        {SCAFFOLD_PRESETS.map((preset) => (
          <button
            key={preset.smarts}
            className="chip"
            disabled={alreadyPreserved(preset.smarts)}
            onClick={() => addScaffold(preset.label, preset.smarts)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form
        className="row row--tight"
        onSubmit={(event) => {
          event.preventDefault()
          void addCustomSmarts()
        }}
      >
        <input
          value={smarts}
          onChange={(e) => setSmarts(e.target.value)}
          placeholder="custom SMARTS, e.g. [CX3](=O)[NX3]"
          spellCheck={false}
          aria-label="Custom SMARTS"
        />
        <button type="submit">Keep</button>
      </form>
      {smartsError && <p className="error">{smartsError}</p>}

      <p className="hint">Bound a property:</p>
      <div className="row row--tight">
        <select value={field} onChange={(e) => setField(e.target.value as NumericField)}>
          {NUMERIC_FIELDS.map((f) => (
            <option key={f} value={f}>{FIELD_LABELS[f]}</option>
          ))}
        </select>
        <select value={bound} onChange={(e) => setBound(e.target.value as 'max' | 'min')}>
          <option value="max">at most</option>
          <option value="min">at least</option>
        </select>
        <input
          className="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          aria-label="Bound value"
        />
        <button onClick={addNumeric}>Add</button>
      </div>

      {constraints.length === 0 ? (
        <p className="hint hint--muted">
          No constraints. Everything will be accepted, and the board has nothing to reject on.
        </p>
      ) : (
        <ul className="constraint-list">
          {constraints.map((constraint) => (
            <li key={constraint.id}>
              <span>{describeConstraint(constraint)}</span>
              <button
                className="remove"
                aria-label="Remove constraint"
                onClick={() => removeConstraint(constraint.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
