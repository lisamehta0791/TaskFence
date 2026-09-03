import { useEffect, useState } from 'react'

/**
 * Single source of truth for motion + WebGL budget.
 *
 * `prefersReduced` respects the OS setting. `isCoarse`/`isSmall` let heavy
 * things (the 3D scene) scale themselves down on phones instead of being
 * dropped entirely.
 */
export function useMotionBudget() {
  const [state, setState] = useState(() => read())

  useEffect(() => {
    const queries = [
      window.matchMedia('(prefers-reduced-motion: reduce)'),
      window.matchMedia('(pointer: coarse)'),
      window.matchMedia('(max-width: 720px)'),
      window.matchMedia('(max-width: 1100px)'),
    ]
    const onChange = () => setState(read())
    queries.forEach((q) => q.addEventListener('change', onChange))
    return () => queries.forEach((q) => q.removeEventListener('change', onChange))
  }, [])

  return state
}

function read() {
  if (typeof window === 'undefined') {
    return { prefersReduced: false, isCoarse: false, isSmall: false, isCompact: false, dpr: [1, 2] as [number, number] }
  }
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const isCoarse = window.matchMedia('(pointer: coarse)').matches
  const isSmall = window.matchMedia('(max-width: 720px)').matches
  const isCompact = window.matchMedia('(max-width: 1100px)').matches
  return {
    prefersReduced,
    isCoarse,
    isSmall,
    isCompact,
    // Cap device pixel ratio on phones — the single biggest WebGL cost.
    dpr: (isSmall ? [1, 1.5] : [1, 2]) as [number, number],
  }
}

export function usePrefersReducedMotion(): boolean {
  return useMotionBudget().prefersReduced
}
