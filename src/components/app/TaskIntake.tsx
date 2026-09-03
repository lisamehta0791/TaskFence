import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { ContractView } from '../ledger/ContractView'
import { useTaskFenceStore } from '../../lib/store/taskfenceStore'
import type { DomainSpec } from '../../lib/domains/types'
import type { CompileResult } from '../../lib/policy/compiler'
import { springSoft } from '../../lib/motion/presets'

/**
 * Natural-language task intake.
 *
 * The human types a sentence; TaskFence shows what it understood *before*
 * anything runs, including the phrases it could not turn into a rule. A silent
 * misreading of a boundary would be the exact failure this project exists to
 * prevent, so an honest "I didn't understand this part" is a feature.
 */
export function TaskIntake({ domain }: { domain: DomainSpec }) {
  const [text, setText] = useState(domain.exampleStatement)
  const [result, setResult] = useState<CompileResult | null>(null)

  const startDelegation = useTaskFenceStore((s) => s.startDelegation)
  const contract = useTaskFenceStore((s) => s.contractFor(domain.id))
  const drafts = useTaskFenceStore((s) => s.drafts)
  const activateDraft = useTaskFenceStore((s) => s.activateDraft)
  const discardDraft = useTaskFenceStore((s) => s.discardDraft)
  const taskKey = useTaskFenceStore((s) => s.taskKey(domain.id))
  const draft = drafts[taskKey]

  const submit = () => {
    if (!text.trim()) return
    setResult(startDelegation(text.trim(), domain))
  }

  return (
    <section className="intake">
      <header className="intake__head">
        <div>
          <h2 className="intake__title">Tell it what to do, and what not to touch</h2>
        </div>
        {contract?.status === 'active' ? <Badge tone="allow">Rules in force</Badge> : null}
      </header>

      <div className="intake__box">
        <textarea
          className="intake__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="e.g. Complete my application from my documents. Don't change what I've already answered. Ask me before submitting."
          aria-label="Describe the task and its boundaries"
        />
        <div className="intake__row">
          <div className="intake__examples">
            {domain.altStatements.map((s) => (
              <motion.button
                key={s}
                className="intake__chip"
                onClick={() => setText(s)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                transition={springSoft}
              >
                {s.length > 52 ? `${s.slice(0, 52)}…` : s}
              </motion.button>
            ))}
          </div>
          <Button onClick={submit} variant="primary">
            {contract ? 'Update the rules' : 'Set the rules'}
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {draft ? (
          <motion.div
            key="draft"
            className="intake__result intake__result--draft"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="intake__result-head">
              <Badge tone="ask" pulse>
                Waiting for you
              </Badge>
              <p>
                Your agent read your request and suggested these rules. Nothing is allowed until you accept them.
              </p>
            </div>
            <ContractView contract={draft.contract} compact />
            {draft.dropped?.length ? (
              <p className="intake__dropped">
                TaskFence dropped {draft.dropped.length} part(s) of the proposal that referred to tools this site does
                not have: {draft.dropped.join('; ')}
              </p>
            ) : null}
            <div className="intake__result-actions">
              <Button variant="ghost" size="sm" onClick={() => discardDraft(domain.id)}>
                Discard
              </Button>
              <Button variant="success" size="sm" onClick={() => activateDraft(domain.id)}>
                Accept these rules
              </Button>
            </div>
          </motion.div>
        ) : result ? (
          <motion.div
            key="result"
            className="intake__result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="intake__understood">
              <h4>Here is what that means in practice</h4>
              <ul>
                {result.understood.map((u) => (
                  <motion.li
                    key={u}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 }}
                  >
                    {u}
                  </motion.li>
                ))}
              </ul>

              {result.clauses.length ? (
                <div className="intake__clauses">
                  {result.clauses.map((c, i) => (
                    <motion.div
                      key={`${c.phrase}-${i}`}
                      className={`intake__clause intake__clause--${c.effect.toLowerCase()}`}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.08 + i * 0.05 }}
                    >
                      <span className="intake__clause-phrase">“{c.phrase}”</span>
                      <span className="intake__clause-arrow">→</span>
                      <span className="intake__clause-rule">{c.ruleLabel}</span>
                    </motion.div>
                  ))}
                </div>
              ) : null}

              {result.unrecognised.length ? (
                <p className="intake__unrecognised">
                  <strong>I could not turn this into a rule:</strong>{' '}
                  {result.unrecognised.map((u) => `"${u}"`).join(', ')}. Nothing is quietly assumed — anything a rule
                  does not cover stops and asks you.
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}
