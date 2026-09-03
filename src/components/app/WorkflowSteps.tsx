import { motion } from 'motion/react'
import { springSoft } from '../../lib/motion/presets'

export type StageId = 'documents' | 'rules' | 'working' | 'done'

export interface Stage {
  id: StageId
  n: number
  title: string
  hint: string
  done: boolean
}

/**
 * Four steps, always visible, so nobody has to guess what to do next.
 *
 * The wording is deliberately ordinary — "tell it what to do", not "compile a
 * delegation contract". The precise machinery is still there underneath; it
 * just isn't the first thing a person has to read.
 */
export function WorkflowSteps({ stages, current }: { stages: Stage[]; current: StageId }) {
  return (
    <ol className="flow" aria-label="Where you are">
      {stages.map((s) => {
        const active = s.id === current
        return (
          <li key={s.id} className={`flow__step ${active ? 'is-active' : ''} ${s.done ? 'is-done' : ''}`}>
            {active ? (
              <motion.span layoutId="flow-active" className="flow__marker" transition={springSoft} />
            ) : null}
            <span className="flow__n" aria-hidden="true">
              {s.done && !active ? '✓' : s.n}
            </span>
            <span className="flow__body">
              <span className="flow__title">{s.title}</span>
              <span className="flow__hint">{s.hint}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
