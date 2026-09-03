import { AnimatePresence } from 'motion/react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Navbar } from './components/layout/Navbar'
import { Footer } from './components/layout/Footer'
import { ApprovalManager } from './components/ledger/ApprovalManager'
import HomePage from './routes/HomePage'
import DemoPage from './routes/DemoPage'
import SubscriptionsPage from './routes/SubscriptionsPage'
import NotFoundPage from './routes/NotFoundPage'

/**
 * Routes are imported eagerly, on purpose.
 *
 * They were lazy, and it caused the visible stutter between pages: with
 * `mode="wait"`, AnimatePresence finishes the exit animation *before* mounting
 * the next route — so if that route's chunk had not been fetched yet, React
 * suspended and painted the loading fallback in the gap. Old page out, blank
 * flash, new page in.
 *
 * The four route modules total about 26KB. The genuinely heavy things —
 * three.js and pdf.js — are still fetched on demand from inside the components
 * that need them, which is where the saving actually was.
 */
export default function App() {
  const location = useLocation()

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <Navbar />

      {/*
        One AnimatePresence for the whole app. Routes never animate themselves —
        they wrap in <PageTransition>, which is driven from here. mode="wait"
        lets the outgoing page finish before the next arrives, so the two never
        overlap mid-scroll.
      */}
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<HomePage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AnimatePresence>

      <Footer />

      {/* Mounted once: an approval can be raised by a tool call from anywhere. */}
      <ApprovalManager />
    </>
  )
}
