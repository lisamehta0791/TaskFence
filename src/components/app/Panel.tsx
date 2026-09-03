import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { revealChild, springSoft } from '../../lib/motion/presets'

/**
 * A numbered section of a workspace.
 *
 * The active step gets an accent edge and a marker; the rest stay perfectly
 * legible but recede, so the eye lands on what to do next without anything
 * being hidden or disabled-looking for no reason.
 *
 * `reveal` opts the panel into its parent's stagger, so the workspace assembles
 * itself top to bottom on arrival instead of appearing all at once.
 *
 * Shared by both demo sites, which is the point — the second site is meant to
 * prove the same machinery works elsewhere, so it should not look home-made.
 */
export function Panel({
  n,
  title,
  active,
  disabled,
  reveal,
  children,
}: {
  n: number
  title: string
  active: boolean
  disabled?: boolean
  reveal?: boolean
  children: ReactNode
}) {
  return (
    <motion.section
      className={`panel ${active ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}
      layout
      variants={reveal ? revealChild : undefined}
      transition={springSoft}
    >
      <header className="panel__head">
        <motion.span
          className="panel__n"
          animate={active ? { scale: [1, 1.18, 1] } : { scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {n}
        </motion.span>
        <h2 className="panel__title">{title}</h2>
        {active ? (
          <motion.span
            className="panel__now"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={springSoft}
          >
            you are here
          </motion.span>
        ) : null}
      </header>
      <div className="panel__body">{children}</div>
    </motion.section>
  )
}
