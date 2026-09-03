import { forwardRef, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import { Link } from 'react-router-dom'
import { springSoft } from '../../lib/motion/presets'
import { usePrefersReducedMotion } from '../../lib/motion/useReducedMotion'

const MotionLink = motion.create(Link)

export type CardTone = 'default' | 'brand' | 'allow' | 'ask' | 'deny' | 'flat'

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children' | 'ref'> {
  tone?: CardTone
  /** Adds the pointer-following highlight and hover lift. */
  interactive?: boolean
  /** Renders the card as a router link. */
  to?: string
  padded?: boolean
  children?: ReactNode
  className?: string
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { tone = 'default', interactive = false, to, padded = true, children, className, ...rest },
  ref,
) {
  const reduced = usePrefersReducedMotion()
  const cls = ['card', `card--${tone}`, padded ? 'card--padded' : '', interactive ? 'card--interactive' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  const hover = interactive && !reduced ? { y: -6 } : undefined

  const inner = (
    <>
      <span className="card__border" aria-hidden="true" />
      {children}
    </>
  )

  if (to) {
    return (
      <MotionLink to={to} className={cls} whileHover={hover} transition={springSoft}>
        {inner}
      </MotionLink>
    )
  }

  return (
    <motion.div ref={ref} className={cls} whileHover={hover} transition={springSoft} {...rest}>
      {inner}
    </motion.div>
  )
})

export function CardTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <h3 className="card__title">
      {icon ? <span className="card__title-icon">{icon}</span> : null}
      {children}
    </h3>
  )
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="card__body">{children}</div>
}
