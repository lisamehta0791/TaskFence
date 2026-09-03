import { Suspense, useEffect, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useMotionBudget } from '../../lib/motion/useReducedMotion'

/**
 * Something for the metal to reflect.
 *
 * A `metalness: 1` material has no diffuse response at all — it can only show
 * you reflections. With no environment it renders very nearly black, which is
 * exactly what happened here: the aperture was a black silhouette with one
 * specular arc on the brass ring.
 *
 * RoomEnvironment is generated in memory and ships inside three itself, so this
 * costs one render into a small cube target and zero network. It is disposed
 * with the component.
 */
function StudioEnvironment() {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = pmrem.fromScene(room, 0.04)
    scene.environment = target.texture

    return () => {
      scene.environment = null
      target.dispose()
      pmrem.dispose()
      room.dispose?.()
    }
  }, [gl, scene])

  return null
}

interface SceneProps {
  children: ReactNode
  className?: string
  /** Camera position. */
  camera?: [number, number, number]
  fov?: number
  /** Rendered while the WebGL context boots. */
  fallback?: ReactNode
  /** Extra lights on top of the default rig. */
  lights?: ReactNode
  ariaLabel: string
}

/**
 * Reusable R3F canvas.
 *
 * Every 3D surface in the app mounts through this component so the lighting
 * rig, tone mapping, pixel-ratio cap and reduced-motion behaviour are decided
 * once. Still deliberately thin: an in-memory environment for the metals, but
 * no post-processing and no shadow maps — it has to stay cheap enough to run
 * behind live text on a mid-range phone.
 */
export function Scene({
  children,
  className,
  camera = [0, 0.5, 6.4],
  fov = 42,
  fallback = null,
  lights,
  ariaLabel,
}: SceneProps) {
  const { prefersReduced, dpr, isSmall } = useMotionBudget()

  return (
    <div className={`scene ${className ?? ''}`} role="img" aria-label={ariaLabel}>
      <Canvas
        dpr={dpr}
        camera={{ position: camera, fov }}
        gl={{ antialias: !isSmall, powerPreference: 'high-performance', alpha: true }}
        // ACES keeps the brass from clipping to flat white where the key light
        // hits, which is what makes it read as a metal rather than a colour.
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.15
        }}
        // With reduced motion we render single frames on demand instead of
        // running a render loop at 60fps.
        frameloop={prefersReduced ? 'demand' : 'always'}
      >
        <Suspense fallback={null}>
          <StudioEnvironment />
          {lights ?? <DefaultLights />}
          {children}
        </Suspense>
      </Canvas>
      {fallback ? <div className="scene__fallback">{fallback}</div> : null}
    </div>
  )
}

/**
 * Product-shot lighting for a machined object on black.
 *
 * A hard key from upper right carves the specular highlights that make metal
 * read as metal; a warm brass rim from behind separates the silhouette from the
 * background; a cool fill keeps the shadow side from going solid black. Ambient
 * is kept low on purpose — on a dark ground, ambient is what flattens things.
 */
export function DefaultLights() {
  return (
    <>
      {/* The environment already supplies fill, so ambient stays low —
          ambient is what flattens a metal into a flat colour. */}
      <ambientLight intensity={0.18} />
      {/* key: carves the specular that makes steel look like steel */}
      <directionalLight position={[4, 5, 6]} intensity={2.1} color="#fff6e8" />
      {/* brass rim from behind, to separate the silhouette from the black */}
      <pointLight position={[-3.2, -2.4, -3]} intensity={70} color="#e0a85c" distance={20} decay={2} />
      {/* cool kicker on the opposite side so the shadow side still has form */}
      <pointLight position={[-5, 3.5, 4]} intensity={30} color="#a8bcd8" distance={22} decay={2} />
    </>
  )
}

