/**
 * @vitest-environment jsdom
 *
 * The 3D gate. jsdom has no WebGL, so what is testable here is the branching
 * around the canvas — and that branching is the part that actually matters for
 * performance and accessibility:
 *
 *   - reduced motion must never fetch three.js at all, only draw the stand-in;
 *   - the canvas must not mount until its container is near the viewport.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LazyHeroScene, LazyLogoScene } from './Lazy3D'

function setMotionPreference(reduced: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('prefers-reduced-motion') ? reduced : false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as never
}

/** An observer that never reports, so nothing is ever considered in view. */
function stubObserver(observe = vi.fn()) {
  class NoopObserver {
    observe = observe
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  ;(window as never as Record<string, unknown>).IntersectionObserver = NoopObserver
  ;(globalThis as never as Record<string, unknown>).IntersectionObserver = NoopObserver
}

beforeEach(() => {
  cleanup()
  stubObserver()
  setMotionPreference(false)
})

describe('reduced motion', () => {
  it('draws the checkpoint by hand instead of booting WebGL', () => {
    setMotionPreference(true)
    const { container } = render(<LazyHeroScene />)

    expect(container.querySelector('.static-gate')).not.toBeNull()
    expect(container.querySelector('canvas')).toBeNull()
    // The stand-in still shows the point: one call stopped at the ring.
    expect(container.querySelector('.static-gate__call.is-blocked')).not.toBeNull()
  })

  it('does the same for the small mark', () => {
    setMotionPreference(true)
    const { container } = render(<LazyLogoScene />)
    expect(container.querySelector('.static-gate')).not.toBeNull()
    expect(container.querySelector('canvas')).toBeNull()
  })
})

describe('lazy mounting', () => {
  it('shows a placeholder until the container is near the viewport', () => {
    const { container } = render(<LazyHeroScene />)
    expect(container.querySelector('.scene-skeleton')).not.toBeNull()
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('watches its own container for intersection', () => {
    const observe = vi.fn()
    stubObserver(observe)
    render(<LazyHeroScene />)
    expect(observe).toHaveBeenCalledTimes(1)
  })

  it('still renders where IntersectionObserver does not exist', () => {
    delete (window as never as Record<string, unknown>).IntersectionObserver
    delete (globalThis as never as Record<string, unknown>).IntersectionObserver

    // With no observer the component treats itself as visible and starts
    // loading the scene. Its Suspense fallback is the same placeholder, so the
    // two states look identical from here — what matters is that it neither
    // throws nor renders nothing.
    const { container } = render(<LazyHeroScene />)
    expect(container.querySelector('.lazy3d')).not.toBeNull()
  })
})
