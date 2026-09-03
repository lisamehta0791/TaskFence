import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useMotionBudget } from '../../lib/motion/useReducedMotion'

const HeroScene = lazy(() => import('./HeroScene'))
const LogoScene = lazy(() => import('./LogoScene'))

/**
 * Gate for WebGL content.
 *
 * three.js is only fetched when the container is actually about to be seen, and
 * never at all when the visitor has asked for reduced motion — they get a
 * static, styled stand-in instead. This keeps the first paint light and honours
 * the OS setting rather than merely slowing the animation down.
 */
function useInView<T extends HTMLElement>(rootMargin = '220px') {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setInView(true)),
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [inView, rootMargin])

  return { ref, inView }
}

interface LazySceneProps {
  className?: string
  placeholder?: ReactNode
  openness?: number
  spin?: number
}

export function LazyHeroScene({ className, openness = 0 }: LazySceneProps) {
  const { ref, inView } = useInView<HTMLDivElement>()
  const { prefersReduced } = useMotionBudget()

  return (
    <div ref={ref} className={`lazy3d ${className ?? ''}`}>
      {prefersReduced ? (
        <StaticCheckpoint />
      ) : inView ? (
        <Suspense fallback={<SceneSkeleton />}>
          <HeroScene openness={openness} />
        </Suspense>
      ) : (
        <SceneSkeleton />
      )}
    </div>
  )
}

export function LazyLogoScene({ className, spin }: LazySceneProps) {
  const { ref, inView } = useInView<HTMLDivElement>()
  const { prefersReduced } = useMotionBudget()

  return (
    <div ref={ref} className={`lazy3d ${className ?? ''}`}>
      {prefersReduced ? (
        <StaticCheckpoint small />
      ) : inView ? (
        <Suspense fallback={<SceneSkeleton />}>
          <LogoScene spin={spin} />
        </Suspense>
      ) : (
        <SceneSkeleton />
      )}
    </div>
  )
}

function SceneSkeleton() {
  return (
    <motion.div
      className="scene-skeleton"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      aria-hidden="true"
    >
      <span className="scene-skeleton__orb" />
    </motion.div>
  )
}

/**
 * Reduced-motion stand-in: the same idea, drawn once, no WebGL at all.
 * Calls queued at a brass ring — one of them stopped.
 */
function StaticCheckpoint({ small }: { small?: boolean }) {
  const calls = Array.from({ length: small ? 4 : 6 })
  return (
    <div className="static-gate" aria-hidden="true">
      <span className="static-gate__ring" />
      <div className="static-gate__stream">
        {calls.map((_, i) => (
          <span
            key={i}
            className={`static-gate__call ${i === 2 ? 'is-blocked' : ''}`}
            style={{ '--i': i } as never}
          />
        ))}
      </div>
    </div>
  )
}
