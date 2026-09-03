import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from 'motion/react'
import { NavLink, useLocation } from 'react-router-dom'
import { ButtonLink } from '../ui/Button'
import { Mark } from '../ui/Mark'
import { ConnectDrawer } from '../agent/ConnectDrawer'
import { useConnection } from '../../lib/webmcp/adapter'
import { dropdownVariants, springSnappy } from '../../lib/motion/presets'

const LINKS = [
  { to: '/', label: 'How it works', end: true },
  { to: '/demo', label: 'Try it' },
  { to: '/subscriptions', label: 'On another site' },
]

export function Navbar() {
  const { scrollY, scrollYProgress } = useScroll()
  // Springing the progress keeps the rail from twitching on trackpad scrolls.
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 40, restDelta: 0.001 })
  const [condensed, setCondensed] = useState(false)
  const [open, setOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const { pathname } = useLocation()
  const live = useConnection((s) => s.surface !== 'none')
  const toolCount = useConnection((s) => s.toolCount)

  useMotionValueEvent(scrollY, 'change', (y) => setCondensed(y > 24))
  useEffect(() => setOpen(false), [pathname])

  return (
    <>
      <motion.header
        className={`nav ${condensed ? 'nav--condensed' : ''}`}
        initial={{ y: -70, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
      >
        <div className="nav__inner container">
          <NavLink to="/" className="nav__brand" aria-label="TaskFence, home">
            <motion.span className="nav__mark" whileHover={{ rotate: 40 }} transition={springSnappy}>
              <Mark size={20} />
            </motion.span>
            <span className="nav__wordmark">TaskFence</span>
          </NavLink>

          <nav className="nav__links" aria-label="Primary">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className="nav__link">
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <motion.span
                        layoutId="nav-active"
                        className="nav__link-pill"
                        transition={{ type: 'spring', stiffness: 460, damping: 38 }}
                      />
                    ) : null}
                    <span className="nav__link-label">{link.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="nav__actions">
            <motion.button
              className={`conn__pill ${live ? 'conn__pill--live' : ''}`}
              onClick={() => setConnectOpen(true)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              title="Check whether a real agent can call this page"
            >
              <span className="conn__dot" />
              <span className="conn__label">{live ? 'Agent connected' : 'Connect an agent'}</span>
              <span className="conn__count">{toolCount}</span>
            </motion.button>

            <div className="nav__cta">
              {/* A router link, not window.location — a hard navigation would
                  reload the app and skip the page transition entirely. */}
              <ButtonLink to="/demo" size="sm" variant="primary" arrow>
                Try it
              </ButtonLink>
            </div>

            <motion.button
              className="nav__burger"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? 'Close menu' : 'Open menu'}
              whileTap={{ scale: 0.92 }}
            >
              <motion.span animate={open ? { rotate: 45, y: 5 } : { rotate: 0, y: 0 }} transition={springSnappy} />
              <motion.span animate={open ? { opacity: 0 } : { opacity: 1 }} transition={{ duration: 0.15 }} />
              <motion.span animate={open ? { rotate: -45, y: -5 } : { rotate: 0, y: 0 }} transition={springSnappy} />
            </motion.button>
          </div>
        </div>

        {/* How far down the page you are, on the navbar's own bottom edge. */}
        <motion.span className="nav__progress" style={{ scaleX: progress }} aria-hidden="true" />
      </motion.header>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="nav__sheet"
            variants={dropdownVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <motion.nav
              className="nav__sheet-links"
              initial="initial"
              animate="animate"
              variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
            >
              {LINKS.map((link) => (
                <motion.div
                  key={link.to}
                  variants={{ initial: { opacity: 0, x: -12 }, animate: { opacity: 1, x: 0 } }}
                >
                  <NavLink to={link.to} end={link.end} className="nav__sheet-link">
                    {link.label}
                  </NavLink>
                </motion.div>
              ))}
            </motion.nav>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ConnectDrawer open={connectOpen} onClose={() => setConnectOpen(false)} />
    </>
  )
}
