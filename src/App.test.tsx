/**
 * @vitest-environment jsdom
 *
 * Mounts the real App shell and walks the routes the way a visitor does —
 * lazy chunks, Suspense, AnimatePresence and all. This is the test that would
 * have caught a route that renders in isolation but blows up in the app.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { registerTools } from './lib/webmcp/adapter'
import { allTools } from './lib/webmcp'
import { useTaskFenceStore } from './lib/store/taskfenceStore'
import { useApplicationStore } from './lib/store/applicationStore'
import { useSubscriptionStore } from './lib/store/subscriptionStore'

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
  useApplicationStore.getState().reset()
  useSubscriptionStore.getState().reset()
})

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

describe('the app shell', () => {
  it('loads the landing page', async () => {
    at('/')
    await waitFor(() => expect(screen.getByText(/Keep the/i)).toBeTruthy())
  })

  it('loads the workspace', async () => {
    at('/demo')
    // You land on the blank, document-driven workspace, not on an example.
    await waitFor(() => expect(screen.getByText('Your form')).toBeTruthy())
  })

  it('loads the second site', async () => {
    at('/subscriptions')
    await waitFor(() => expect(screen.getByText('Lumen Video')).toBeTruthy())
    expect(screen.getByText('Forge Design Suite')).toBeTruthy()
    expect(screen.getByLabelText(/Delegation ledger/i)).toBeTruthy()
  })

  it('falls back for an unknown route', async () => {
    at('/nope')
    await waitFor(() => expect(screen.getByText(/Nothing delegated here/i)).toBeTruthy())
  })
})
