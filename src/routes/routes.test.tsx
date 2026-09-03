/**
 * @vitest-environment jsdom
 *
 * Every route renders. IntersectionObserver is stubbed so it never fires, which
 * keeps the lazy WebGL scene at its skeleton state — jsdom has no WebGL, and
 * the point here is to catch render and hook errors, not to test three.js.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HomePage from './HomePage'
import SubscriptionsPage from './SubscriptionsPage'
import NotFoundPage from './NotFoundPage'
import { Navbar } from '../components/layout/Navbar'
import { Footer } from '../components/layout/Footer'
import { registerTools } from '../lib/webmcp/adapter'
import { allTools } from '../lib/webmcp'
import { useTaskFenceStore } from '../lib/store/taskfenceStore'
import { useSubscriptionStore } from '../lib/store/subscriptionStore'

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as never
  window.scrollTo = (() => {}) as never
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  ;(window as never as Record<string, unknown>).IntersectionObserver = NoopObserver
  ;(globalThis as never as Record<string, unknown>).IntersectionObserver = NoopObserver
  registerTools(allTools)
})

beforeEach(() => {
  cleanup()
  useTaskFenceStore.getState().resetSession()
  useSubscriptionStore.getState().reset()
})

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('routes render', () => {
  it('home leads with the plain-language pitch', () => {
    wrap(<HomePage />)
    expect(screen.getByText(/Keep the/i)).toBeTruthy()
    expect(screen.getByText(/Four steps, and you only appear in two of them/i)).toBeTruthy()
    expect(screen.getByText(/No AI decides whether your rule holds/i)).toBeTruthy()
  })

  it('subscriptions leads with the point of the page', () => {
    wrap(<SubscriptionsPage />)
    expect(screen.getByText(/A different site\. The same fence\./i)).toBeTruthy()
    expect(screen.getByText('Lumen Video')).toBeTruthy()
    expect(screen.getByText(/not one line of the rule engine/i)).toBeTruthy()
  })

  it('locks the second site’s agent until its own rules are set', () => {
    wrap(<SubscriptionsPage />)
    expect(screen.getByText(/the fence does not care which site it is on/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Start the agent/i })).toBeNull()
  })

  it('not found', () => {
    wrap(<NotFoundPage />)
    expect(screen.getByText(/Nothing delegated here/i)).toBeTruthy()
  })
})

describe('shell', () => {
  it('navigates to three places, not seven', () => {
    wrap(<Navbar />)
    const nav = screen.getByLabelText('Primary')
    expect(nav.querySelectorAll('a')).toHaveLength(3)
  })

  it('offers the connection check without a page of its own', () => {
    wrap(<Navbar />)
    expect(screen.getByText(/Connect an agent|Agent connected/i)).toBeTruthy()
  })

  it('footer does not link to pages that no longer exist', () => {
    wrap(<Footer />)
    const hrefs = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('/about')
    expect(hrefs).not.toContain('/connect')
    expect(hrefs).not.toContain('/ledger')
    expect(hrefs).not.toContain('/agents')
  })
})
