import { useEffect, useRef } from 'react'

/**
 * Window-level normalised pointer (-1..1 on both axes).
 *
 * R3F's own `state.pointer` only updates from events that reach the canvas —
 * and the hero canvas sits *behind* the copy with `pointer-events: none`, so it
 * receives none. Tracking at the window instead means the scene reacts wherever
 * the cursor is, including while the visitor is reading the headline.
 *
 * The value lives in a ref: pointer movement must never cause a React render.
 */
export function usePointerField() {
  const pointer = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    // Touch devices get a light tilt on tap rather than a follow.
    const onLeave = () => {
      pointer.current.x = 0
      pointer.current.y = 0
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return pointer
}
