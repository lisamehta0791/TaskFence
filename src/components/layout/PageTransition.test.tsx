/**
 * @vitest-environment jsdom
 *
 * Navigation and its animation.
 *
 * Two regressions are pinned here because both were real and both were
 * invisible in the UI right up until you clicked something:
 *   - routes were lazy, so `mode="wait"` painted a loading fallback in the gap
 *     between the old page leaving and the new one arriving;
 *   - the navbar CTA used `window.location.href`, which reloads the whole app
 *     and skips the transition altogether.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../App'
import { CountUp } from '../ui/CountUp'
import { registerTools } from '../../lib/webmcp/adapter'
import { allTools } from '../../lib/webmcp'
import { useTaskFenceStore } from '../../lib/store/taskfenceStore'
import { useApplicationStore } from '../../lib/store/applicationStore'

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
})

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

describe('page transitions', () => {
  it('renders the shutter over each route', () => {
    const { container } = at('/')
    expect(container.querySelector('.shutter')).not.toBeNull()
  })

  it('gives every route a main region to animate', () => {
    at('/demo')
    expect(document.querySelector('main#main')).not.toBeNull()
  })

  it('never paints a loading fallback between pages', async () => {
    at('/')
    await waitFor(() => expect(screen.getByText(/Keep the/i)).toBeTruthy())

    // Both the navbar and the hero link there; take the navbar's.
    act(() => {
      fireEvent.click(screen.getAllByRole('link', { name: /On another site/i })[0])
    })

    // The destination must be there immediately — no Suspense gap.
    await waitFor(() => expect(screen.getByText('Lumen Video')).toBeTruthy())
    expect(document.querySelector('.route-fallback')).toBeNull()
  })

  it('navigates in-app rather than reloading the page', () => {
    at('/')
    // Every nav destination is an anchor the router owns.
    const cta = screen.getAllByRole('link', { name: /Try it/i })
    expect(cta.length).toBeGreaterThan(0)
    cta.forEach((el) => expect(el.getAttribute('href')).toBe('/demo'))
  })

  it('swaps content when the route changes', async () => {
    at('/')
    await waitFor(() => expect(screen.getByText(/Four steps/i)).toBeTruthy())

    act(() => {
      fireEvent.click(screen.getAllByRole('link', { name: /Try it/i })[0])
    })

    await waitFor(() => expect(screen.getByText('Your form')).toBeTruthy())
    expect(screen.queryByText(/Four steps/i)).toBeNull()
  })
})

describe('CountUp', () => {
  // The observer never reports in jsdom, which is exactly the case the
  // component's safety net exists for: it must still show the true number.
  it('lands on the target value even when it is never seen to enter view', async () => {
    render(<CountUp to={18} />)
    await waitFor(() => expect(screen.getByLabelText('18').textContent).toBe('18'), { timeout: 2500 })
  })

  it('handles zero', async () => {
    render(<CountUp to={0} />)
    await waitFor(() => expect(screen.getByLabelText('0').textContent).toBe('0'), { timeout: 2500 })
  })

  it('shows the final number immediately when motion is reduced', () => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('reduced-motion'),
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as never
    render(<CountUp to={7} />)
    expect(screen.getByLabelText('7').textContent).toBe('7')
  })
})
