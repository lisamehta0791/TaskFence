import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  revealChild,
  revealChildReduced,
  staggerParent,
} from '../../lib/motion/presets'
import { usePrefersReducedMotion } from '../../lib/motion/useReducedMotion'

interface ScrollRevealProps {
  children: ReactNode
  /** Seconds between children. 0 reveals the block as one unit. */
  stagger?: number
  delay?: number
  once?: boolean
  amount?: number
  className?: string
  as?: 'div' | 'section' | 'ul' | 'header'
}

/**
 * Scroll-triggered reveal. Wrap a block, mark its children with
 * `<ScrollReveal.Item>` and they arrive in sequence as the block enters view.
 */
export function ScrollReveal({
  children,
  stagger = 0.08,
  delay = 0,
  once = true,
  amount = 0.25,
  className,
  as = 'div',
}: ScrollRevealProps) {
  const reduced = usePrefersReducedMotion()
  const Comp = motion[as]

  return (
    <Comp
      className={className}
      variants={staggerParent(reduced ? 0 : stagger, reduced ? 0 : delay)}
      initial="initial"
      whileInView="animate"
      viewport={{ once, amount }}
    >
      {children}
    </Comp>
  )
}

function Item({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'li' | 'p' | 'h1' | 'h2' | 'h3' | 'span'
}) {
  const reduced = usePrefersReducedMotion()
  const Comp = motion[as]
  return (
    <Comp className={className} variants={reduced ? revealChildReduced : revealChild}>
      {children}
    </Comp>
  )
}

ScrollReveal.Item = Item
