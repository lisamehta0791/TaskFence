import { motion } from 'motion/react'
import { Button } from '../ui/Button'
import { useRecordStore } from '../../lib/domains'
import type { DomainSpec } from '../../lib/domains/types'
import { useTaskFenceStore } from '../../lib/store/taskfenceStore'
import { useAgentConsole } from '../../lib/agent/console'
import { springSoft } from '../../lib/motion/presets'

/**
 * "How do I know it's finished, and what do I do now?"
 *
 * Shown the moment a run ends. It says what happened in counts a person can
 * check against the form in front of them, and then gives the three things
 * anyone actually wants next: look at the record, change something yourself,
 * or run it again.
 */
export function CompletionPanel({
  domain,
  onSeeRecord,
  onEditYourself,
  onRunAgain,
}: {
  domain: DomainSpec
  onSeeRecord: () => void
  onEditYourself: () => void
  onRunAgain: () => void
}) {
  const store = useRecordStore(domain.id)
  const finishedAt = useAgentConsole((s) => s.finishedAt)
  const stopped = useAgentConsole((s) => s.stopped)
  const ledger = useTaskFenceStore((s) => s.ledger)
  const activeAgentId = useTaskFenceStore((s) => s.activeAgentId)
  const values = store((s) => s.values)
  const fields = store((s) => s.fields)
  const submitted = store((s) => s.submitted)
  const reference = store((s) => s.reference)

  if (!finishedAt && !stopped) return null

  const taskKey = `${activeAgentId}::${domain.id}`
  const rows = ledger.filter((e) => e.taskId === taskKey)

  const filled = rows.filter((e) => e.operation === 'WRITE' && e.status === 'allowed').length
  const approved = rows.filter((e) => e.status === 'approved-with-exception').length
  const blocked = rows.filter((e) => e.status === 'denied' || e.status === 'refused-by-human').length

  const stillBlank = fields.filter((f) => f.required && !(values[f.id]?.value ?? '').trim())

  return (
    <motion.section
      className={`done ${stopped ? 'done--stopped' : ''}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSoft}
      aria-live="polite"
    >
      <header className="done__head">
        <span className="done__tick" aria-hidden="true">
          {stopped ? '■' : '✓'}
        </span>
        <div>
          <h2>{stopped ? 'You stopped the agent' : 'Your agent has finished'}</h2>
          <p className="muted">
            {submitted
              ? `The application was submitted with your approval. Reference ${reference}.`
              : stillBlank.length
                ? `${stillBlank.length} required field${stillBlank.length === 1 ? '' : 's'} still need${stillBlank.length === 1 ? 's' : ''} filling in: ${stillBlank.map((f) => f.label).join(', ')}.`
                : 'Everything required is filled in. Nothing has been submitted.'}
          </p>
        </div>
      </header>

      <div className="done__counts">
        <motion.div className="done__count" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <strong>{filled}</strong>
          <span>fields it filled on its own, inside your rules</span>
        </motion.div>
        <motion.div className="done__count" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <strong>{approved}</strong>
          <span>things it had to ask you about</span>
        </motion.div>
        <motion.div className="done__count" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <strong>{blocked}</strong>
          <span>things it was stopped from doing</span>
        </motion.div>
      </div>

      <p className="done__reassure">
        Everything below is still yours. Type into any field to change it — the agent’s rules apply to the agent, not
        to you.
      </p>

      <div className="done__actions">
        <Button variant="primary" onClick={onSeeRecord}>
          See exactly what it did
        </Button>
        <Button variant="secondary" onClick={onEditYourself}>
          Change something myself
        </Button>
        <Button variant="ghost" onClick={onRunAgain}>
          Run it again
        </Button>
      </div>
    </motion.section>
  )
}
