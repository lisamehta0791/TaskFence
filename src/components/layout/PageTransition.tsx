import { useEffect, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useLocation } from 'react-router-dom'
import { easeOut, pageVariants, pageVariantsReduced } from '../../lib/motion/presets'
import { usePrefersReducedMotion } from '../../lib/motion/useReducedMotion'

/**
 * The one page transition in the app.
 *
 * Routes never define their own enter/exit animation — they wrap themselves in
 * this component, which is driven by the single <AnimatePresence> in App.tsx.
 * Scroll restoration lives here too, so it cannot get out of step.
 *
 * The shutter is the visible half. A panel starts covering the viewport and
 * pulls away to the right, so a route change reads as a camera shutter opening
 * — which is the same idea as the aperture in the hero. The previous version
 * was a 2px hairline at the very top of the page and nobody ever saw it.
 */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = usePrefersReducedMotion()
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  return (
    <>
      {reduced ? null : (
        <motion.div
          className="shutter"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: 0.62, ease: easeOut }}
          style={{ originX: 1 }}
          aria-hidden="true"
        />
      )}
      <motion.main
        id="main"
        className={className}
        variants={reduced ? pageVariantsReduced : pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.main>
    </>
  )
}
