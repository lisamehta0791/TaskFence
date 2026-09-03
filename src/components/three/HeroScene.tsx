import { Checkpoint } from './Checkpoint'
import { Scene } from './Scene'

/**
 * Hero scene. Default export so it can be code-split away from the main bundle
 * (see Lazy3D.tsx) — three.js is by far the heaviest dependency in the app and
 * only the landing page needs it.
 */
export default function HeroScene({ openness = 0 }: { openness?: number }) {
  return (
    <Scene
      className="scene--hero"
      camera={[0, 0.35, 7]}
      fov={42}
      ariaLabel="A stream of tool calls travelling toward a brass ring. Most pass straight through and turn green on the far side; every so often one reaches the ring, is stopped dead, flares red and falls away without getting through."
    >
      <Checkpoint intensity={openness} />
    </Scene>
  )
}
