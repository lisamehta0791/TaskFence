/**
 * Shared motion vocabulary.
 *
 * Everything animates from here, so timing and feel stay consistent and there
 * is one place to tune them.
 *
 * Rule of the file: animate `transform` and `opacity` only. Those two are the
 * only properties the compositor can handle without repainting. Animating
 * `filter: blur()` across a whole page looks lovely in isolation and then
 * flickers on real hardware — especially over a WebGL canvas — so it is not
 * used on anything large.
 */

import type { Transition, Variants } from 'motion/react'

export const easeOut = [0.16, 1, 0.3, 1] as const
export const easeInOut = [0.65, 0, 0.35, 1] as const

export const springSoft: Transition = { type: 'spring', stiffness: 340, damping: 32, mass: 0.7 }
export const springSnappy: Transition = { type: 'spring', stiffness: 520, damping: 34, mass: 0.6 }
export const springGentle: Transition = { type: 'spring', stiffness: 180, damping: 26 }
/** For buttons and small controls: quick, with just enough overshoot to feel alive. */
export const springPress: Transition = { type: 'spring', stiffness: 620, damping: 24, mass: 0.5 }

/** Button / interactive press feedback. */
export const press = {
  hover: { y: -3, scale: 1.03 },
  tap: { y: -1, scale: 0.96 },
}

/** Card lift on hover. */
export const lift = {
  rest: { y: 0 },
  hover: { y: -8 },
}

/* ---- Page transitions --------------------------------------------------- */

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 26, scale: 0.99 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: easeOut, when: 'beforeChildren' },
  },
  exit: {
    opacity: 0,
    y: -16,
    scale: 0.995,
    transition: { duration: 0.26, ease: easeInOut },
  },
}

export const pageVariantsReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
}


/* ---- Staggered reveals -------------------------------------------------- */

export const staggerParent = (stagger = 0.08, delay = 0): Variants => ({
  initial: {},
  animate: { transition: { staggerChildren: stagger, delayChildren: delay } },
})

export const revealChild: Variants = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.65, ease: easeOut } },
}

export const revealChildReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
}

/* ---- Overlays ----------------------------------------------------------- */

export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.24 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
}

export const modalVariants: Variants = {
  initial: { opacity: 0, y: 36, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1, transition: springSoft },
  exit: { opacity: 0, y: 18, scale: 0.97, transition: { duration: 0.18, ease: easeInOut } },
}

export const dropdownVariants: Variants = {
  initial: { opacity: 0, y: -12, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: springSnappy },
  exit: { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.14 } },
}

/** Ledger rows and console lines arriving one at a time. */
export const listItemVariants: Variants = {
  initial: { opacity: 0, x: -18, height: 0 },
  animate: { opacity: 1, x: 0, height: 'auto', transition: springSoft },
  exit: { opacity: 0, x: 16, transition: { duration: 0.18 } },
}
