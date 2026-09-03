import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useRecordStore } from '../../lib/domains'
import type { DomainSpec, FieldSpec } from '../../lib/domains/types'
import { buildRequest, decide, useTaskFenceStore } from '../../lib/store/taskfenceStore'
import { worldFor } from '../../lib/webmcp/guard'
import { formToolNames } from '../../lib/webmcp/tools/form'
import { Button } from '../ui/Button'
import { springSoft } from '../../lib/motion/presets'
import { checkRecordValues, type FormatProblem } from '../../lib/validation/format'

/**
 * The record itself, with field-level trust badges.
 *
 * Each badge is not decoration: it is the *actual* policy engine answer for a
 * hypothetical write to that field right now. If a badge says "locked", an
 * agent calling the update tool on it will be blocked, because the same
 * evaluate() call decides both.
 *
 * Works for any workspace. On a user-defined one it also lets you add the
 * fields yourself, or take the ones a document turned out to contain.
 */
export function ApplicationForm({ domain }: { domain: DomainSpec }) {
  const store = useRecordStore(domain.id)
  const fields = store((s) => s.fields)
  const values = store((s) => s.values)
  const documents = store((s) => s.documents)
  const focusField = store((s) => s.focusField)
  const setValue = store((s) => s.setValue)
  const addField = store((s) => s.addField)
  const removeField = store((s) => s.removeField)
  const submitted = store((s) => s.submitted)
  const reference = store((s) => s.reference)

  // Re-derive badges whenever the rules or the values change.
  const contracts = useTaskFenceStore((s) => s.contracts)
  const activeAgentId = useTaskFenceStore((s) => s.activeAgentId)
  const toolNames = formToolNames(domain)

  const badges = useMemo(() => {
    const world = worldFor(domain)
    const contract = useTaskFenceStore.getState().contractFor(domain.id)
    const out: Record<string, 'allow' | 'deny' | 'ask' | 'none'> = {}
    for (const f of fields) {
      const req = buildRequest({
        domain,
        tool: toolNames.update,
        args: { field: f.id },
        field: f.id,
        source: 'document',
      })
      out[f.id] = contract ? (decide(domain, req, world).decision.toLowerCase() as never) : 'none'
    }
    return out
  }, [contracts, values, activeAgentId, fields, domain, toolNames.update])

  const groups = useMemo(() => {
    const map = new Map<string, FieldSpec[]>()
    fields.forEach((f) => map.set(f.group, [...(map.get(f.group) ?? []), f]))
    return [...map.entries()]
  }, [fields])

  // Answers that do not look like answers. Shown whether or not an agent has
  // run: the check is deterministic, so the page can do it as you type.
  const problems = useMemo(() => {
    const out: Record<string, FormatProblem> = {}
    for (const p of checkRecordValues(fields, values)) out[p.fieldId] = p
    return out
  }, [fields, values])

  const userDefined = Boolean(domain.form?.userDefined)

  return (
    <div className="appform">
      <header className="appform__head">
        <div>
          <h2 className="appform__title">{domain.form?.title}</h2>
          <p className="muted">{domain.form?.subtitle}</p>
        </div>
        <AnimatePresence>
          {submitted ? (
            <motion.div
              className="appform__submitted"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springSoft}
            >
              Submitted · {reference}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      {fields.length === 0 && !submitted ? (
        <p className="appform__empty">{domain.form?.emptyHint}</p>
      ) : null}

      {groups.map(([group, groupFields]) => (
        <fieldset key={group} className="appform__group">
          <legend>{group}</legend>
          <div className="appform__fields">
            {groupFields.map((f) => {
              const record = values[f.id]
              const badge = badges[f.id] ?? 'none'
              const active = focusField === f.id
              return (
                <motion.div
                  key={f.id}
                  className={`appfield appfield--${badge} ${active ? 'is-active' : ''}`}
                  layout
                  animate={
                    active
                      ? { boxShadow: '0 0 0 1px rgba(224,168,92,0.6), 0 10px 40px -14px rgba(224,168,92,0.5)' }
                      : { boxShadow: '0 0 0 1px rgba(255,255,255,0.06)' }
                  }
                  transition={springSoft}
                >
                  <div className="appfield__top">
                    <label className="appfield__label" htmlFor={`f-${domain.id}-${f.id}`}>
                      {f.label}
                      {f.required ? <span className="appfield__req">required</span> : null}
                    </label>
                    <div className="appfield__badges">
                      <TrustBadge state={badge} writtenBy={record?.writtenBy ?? null} />
                      {userDefined ? (
                        <button
                          className="appfield__remove"
                          onClick={() => removeField(f.id)}
                          aria-label={`Remove ${f.label}`}
                        >
                          remove
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {f.type === 'textarea' ? (
                    <textarea
                      id={`f-${domain.id}-${f.id}`}
                      className="appfield__input"
                      rows={3}
                      value={record?.value ?? ''}
                      onChange={(e) => setValue(f.id, e.target.value, 'human')}
                      disabled={submitted}
                    />
                  ) : (
                    <input
                      id={`f-${domain.id}-${f.id}`}
                      className="appfield__input"
                      value={record?.value ?? ''}
                      placeholder={f.placeholder ?? (f.type === 'money' ? '0' : '')}
                      onChange={(e) => setValue(f.id, e.target.value, 'human')}
                      disabled={submitted}
                    />
                  )}

                  {f.help ? <p className="appfield__help">{f.help}</p> : null}

                  <AnimatePresence>
                    {problems[f.id] ? (
                      <motion.p
                        className={`appfield__problem appfield__problem--${problems[f.id].severity}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        {problems[f.id].severity === 'error' ? 'Does not look right' : 'Worth a check'} — this{' '}
                        {problems[f.id].problem}. Expected {problems[f.id].expected}.
                      </motion.p>
                    ) : null}
                  </AnimatePresence>

                  <AnimatePresence>
                    {record?.writtenBy === 'agent' ? (
                      <motion.p
                        className="appfield__origin"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        filled by your agent
                        {record.sourceDocumentId ? ` from ${record.sourceDocumentId.replace('doc_', '')}` : ''}
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        </fieldset>
      ))}

      {userDefined ? (
        submitted ? (
          // A submitted record is read-only by design — but a disabled button
          // with no explanation reads as "broken", so say it outright.
          <p className="appform__locked">
            This record was submitted{reference ? ` (${reference})` : ''} and is now read-only — fields can no
            longer be added or changed. Press <strong>Start over</strong> at the top of the page to begin a fresh
            one.
          </p>
        ) : (
          <FieldBuilder existing={fields} suggestions={suggestFields(documents)} onAdd={addField} />
        )
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Defining your own fields
 * ------------------------------------------------------------------ */

/** Field ids a document turned out to contain, that are not on the form yet. */
function suggestFields(documents: { extracted: Record<string, string>; readable: boolean }[]): string[] {
  const found = new Set<string>()
  documents.filter((d) => d.readable).forEach((d) => Object.keys(d.extracted).forEach((k) => found.add(k)))
  return [...found]
}

function humanise(id: string): string {
  const spaced = id.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

function slugify(label: string): string {
  const parts = label.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (!parts.length) return ''
  return parts[0] + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join('')
}

function FieldBuilder({
  existing,
  suggestions,
  onAdd,
  disabled,
}: {
  existing: FieldSpec[]
  suggestions: string[]
  onAdd: (f: FieldSpec) => void
  disabled?: boolean
}) {
  const [label, setLabel] = useState('')
  const [group, setGroup] = useState('Details')
  const [required, setRequired] = useState(true)

  const unused = suggestions.filter((s) => !existing.some((f) => f.id === s))

  const add = (id: string, text: string) => {
    if (!id) return
    onAdd({ id, label: text, type: 'text', group, required })
  }

  return (
    <div className="builder">
      <h3 className="builder__title">Add a field</h3>

      {unused.length ? (
        <div className="builder__suggest">
          <p className="muted">
            Your documents mention these. Tap one to add it — the agent can then fill it from that document.
          </p>
          <div className="builder__chips">
            {unused.map((id) => (
              <motion.button
                key={id}
                className="builder__chip"
                onClick={() => add(id, humanise(id))}
                disabled={disabled}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                + {humanise(id)}
              </motion.button>
            ))}
          </div>
        </div>
      ) : null}

      <form
        className="builder__row"
        onSubmit={(e) => {
          e.preventDefault()
          const id = slugify(label)
          if (!id) return
          add(id, label.trim())
          setLabel('')
        }}
      >
        <input
          className="builder__input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Field name, e.g. Policy number"
          aria-label="New field name"
          disabled={disabled}
        />
        <input
          className="builder__input builder__input--group"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          placeholder="Section"
          aria-label="Section"
          disabled={disabled}
        />
        <label className="builder__check">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            disabled={disabled}
          />
          required
        </label>
        <Button type="submit" size="sm" variant="secondary" disabled={disabled || !label.trim()}>
          Add
        </Button>
      </form>
    </div>
  )
}

function TrustBadge({
  state,
  writtenBy,
}: {
  state: 'allow' | 'deny' | 'ask' | 'none'
  writtenBy: 'human' | 'agent' | null
}) {
  if (state === 'none') {
    return <span className="trust trust--none">no rules yet</span>
  }
  const map = {
    allow: { label: 'agent may fill', icon: '✓' },
    deny: { label: writtenBy === 'human' ? 'locked — your answer' : 'locked', icon: '⊘' },
    ask: { label: 'asks you first', icon: '❚❚' },
  } as const
  const m = map[state]
  return (
    <motion.span layout className={`trust trust--${state}`} title="Policy engine result for a write to this field">
      <span aria-hidden="true">{m.icon}</span>
      {m.label}
    </motion.span>
  )
}
