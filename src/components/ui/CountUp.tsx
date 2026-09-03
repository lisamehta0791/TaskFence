import { useEffect, useRef, useState } from 'react'
import { animate, useInView } from 'motion/react'
import { usePrefersReducedMotion } from '../../lib/motion/useReducedMotion'

/**
 * A figure that counts up the first time it is seen.
 *
 * Fails to the *right answer*, not to zero. If IntersectionObserver never
 * reports — no support, a hidden container, a stubbed observer — the number
 * snaps to its true value shortly after mount rather than sitting on 0 and
 * quietly telling the reader something false.
 */
const FALLBACK_MS = 900

export function CountUp({ to, duration = 1.1 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduced = usePrefersReducedMotion()
  const [value, setValue] = useState(reduced ? to : 0)
  const started = useRef(reduced)

  useEffect(() => {
    if (reduced || started.current || !inView) return
    started.current = true
    const controls = animate(0, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(Math.round(v)),
      onComplete: () => setValue(to),
    })
    return () => controls.stop()
  }, [inView, reduced, to, duration])

  // Safety net: never leave a wrong number on screen.
  useEffect(() => {
    if (reduced) return
    const t = window.setTimeout(() => {
      if (!started.current) {
        started.current = true
        setValue(to)
      }
    }, FALLBACK_MS)
    return () => window.clearTimeout(t)
  }, [reduced, to])

  return (
    <span ref={ref} aria-label={String(to)}>
      {value}
    </span>
  )
}
