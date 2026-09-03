import { motion } from 'motion/react'
import type { DomainSpec } from '../../lib/domains/types'
import { springSoft } from '../../lib/motion/presets'

/**
 * Which workspace you are working in.
 *
 * This exists to answer the most reasonable question anyone asks on arrival:
 * "is this a scholarship app?" No — the scholarship is one workspace, defined
 * by a config object, and so is every other one. Switching here swaps the form,
 * the documents and the agent's tools; it does not swap a single line of the
 * rule engine, the record, or the approval flow.
 */
export function WorkspacePicker({
  domains,
  activeId,
  onChange,
  disabled,
}: {
  domains: DomainSpec[]
  activeId: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  return (
    <div className="wpick">
      <div className="wpick__head">
        <span className="wpick__label">Workspace</span>
        <span className="wpick__note">
          Same fence, same rules, same record — only the form changes.
        </span>
      </div>

      <div className="wpick__options" role="radiogroup" aria-label="Workspace">
        {domains.map((d) => {
          const active = d.id === activeId
          return (
            <motion.button
              key={d.id}
              role="radio"
              aria-checked={active}
              className={`wpick__option ${active ? 'is-active' : ''}`}
              onClick={() => onChange(d.id)}
              disabled={disabled}
              whileHover={disabled ? undefined : { y: -2 }}
              whileTap={disabled ? undefined : { scale: 0.985 }}
              transition={springSoft}
            >
              {active ? (
                <motion.span layoutId="wpick-active" className="wpick__marker" transition={springSoft} />
              ) : null}
              <span className="wpick__name">{d.taskTitle}</span>
              <span className="wpick__blurb">{d.blurb}</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
