import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useMotionBudget } from '../../lib/motion/useReducedMotion'
import { usePointerField } from './usePointerField'

/**
 * The hero object: the enforcement point itself.
 *
 * A stream of tool calls travels toward a brass ring — the fence. Most pass
 * straight through and turn green on the far side. Every so often one reaches
 * the ring, is stopped dead, flares red and falls away without ever getting
 * through.
 *
 * That is literally what the product does, so the hero is the mechanism rather
 * than a metaphor for it: every call is checked at the boundary, before it runs.
 *
 * Two things worth knowing before changing this:
 *
 *  - The object is NEVER scaled to fit. Scaling the group also scales the
 *    packets' travel along Z, which pushed them straight through the camera and
 *    sliced them on the near plane. The camera moves instead, so travel stays
 *    in fixed world units and always sits in front of the lens.
 *  - Which calls are stopped comes from a hash of (packet, lap), not
 *    Math.random(). The scene replays identically, which matters when the whole
 *    project's claim is that the same input gives the same decision.
 */

const STEEL = new THREE.Color('#aeb4c0')
const ALLOW = new THREE.Color('#5fd39a')
const DENY = new THREE.Color('#ff6f6f')
const BRASS = new THREE.Color('#e8b06a')

/** Where the stream starts, where the fence is, and where it ends. */
const Z_START = -5.6
const Z_GATE = 0
const Z_END = 2.6
const GATE_AT = (Z_GATE - Z_START) / (Z_END - Z_START)

const PORTAL_RADIUS = 1.72
/** How much of the shorter canvas axis the ring should occupy. */
const FILL = 0.82
/** Never let the stream get closer to the lens than this. */
const CAMERA_MARGIN = 2.2

/** Stable pseudo-random in [0,1) from two integers — no Math.random anywhere. */
function hash(a: number, b: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return n - Math.floor(n)
}

interface CheckpointProps {
  /** 0 = calm, 1 = busy. Lets a page drive how much traffic there is. */
  intensity?: number
}

export function Checkpoint({ intensity = 0 }: CheckpointProps) {
  const { prefersReduced, isSmall, isCoarse } = useMotionBudget()

  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const membrane = useRef<THREE.Mesh>(null)
  const packetRefs = useRef<Array<THREE.Group | null>>([])

  const pointer = usePointerField()
  const current = useRef({ x: 0, y: 0 })

  /* ---- Fit by moving the lens, not by resizing the world ---------------- */
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)

  useEffect(() => {
    const fov = (camera.fov * Math.PI) / 180
    const aspect = size.width / Math.max(1, size.height)
    // Distance at which the ring fills FILL of the vertical view...
    let distance = (PORTAL_RADIUS * 2) / (FILL * 2 * Math.tan(fov / 2))
    // ...then back off further if the canvas is narrower than it is tall,
    // because then width is the binding constraint.
    if (aspect < 1) distance /= aspect
    camera.position.set(0, 0, Math.max(distance, Z_END + CAMERA_MARGIN))
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, size])

  const packetCount = isSmall ? 9 : 16

  const packets = useMemo(
    () =>
      Array.from({ length: packetCount }, (_, i) => ({
        offset: i / packetCount,
        speed: 0.17 + hash(i, 7) * 0.06,
        // Kept well inside the ring, so they visibly pass *through* it.
        lane: { x: (hash(i, 3) - 0.5) * 1.15, y: (hash(i, 11) - 0.5) * 1.15 },
        spin: 0.4 + hash(i, 5) * 0.8,
      })),
    [packetCount],
  )

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const d = Math.min(delta, 0.05)
    if (prefersReduced) return

    // Damped cursor parallax. Refs only — pointer motion never re-renders React.
    const strength = isCoarse ? 0.07 : 0.16
    const tx = pointer.current.x * strength
    const ty = -pointer.current.y * strength * 0.6
    current.current.x += (tx - current.current.x) * (1 - Math.exp(-5 * d))
    current.current.y += (ty - current.current.y) * (1 - Math.exp(-5 * d))

    if (group.current) {
      // Enough yaw that travel along Z reads as lateral movement on screen,
      // not as things bunching up in the middle of the ring.
      group.current.rotation.y = -0.62 + current.current.x
      group.current.rotation.x = 0.13 + current.current.y
      group.current.position.y = Math.sin(t * 0.5) * 0.04
    }

    let checkFlash = 0

    packetRefs.current.forEach((node, i) => {
      if (!node) return
      const p = packets[i]

      const raw = t * p.speed + p.offset
      const lap = Math.floor(raw)
      const phase = raw - lap
      // Roughly one call in four is outside the delegation.
      const blocked = hash(i, lap) < 0.26

      let z: number
      let opacity: number
      let size = 1
      const colour = new THREE.Color()

      if (!blocked) {
        z = Z_START + (Z_END - Z_START) * phase
        colour.copy(STEEL).lerp(ALLOW, phase > GATE_AT ? 1 : 0)
        // Fade in on arrival, and out well before it reaches the lens.
        opacity = Math.min(1, phase / 0.1, (1 - phase) / 0.3)
      } else if (phase < GATE_AT) {
        // Still approaching — indistinguishable from any other call.
        z = Z_START + (Z_GATE - Z_START) * (phase / GATE_AT)
        colour.copy(STEEL)
        opacity = Math.min(1, phase / 0.1)
      } else {
        // Stopped at the fence. It never gets through.
        const since = (phase - GATE_AT) / (1 - GATE_AT)
        z = Z_GATE - 0.24 - since * 0.55
        colour.copy(STEEL).lerp(DENY, Math.min(1, since * 5))
        opacity = Math.max(0, 1 - since * 1.9)
        size = 1 + Math.sin(Math.min(1, since * 4) * Math.PI) * 0.4
        checkFlash = Math.max(checkFlash, opacity)
      }

      node.position.set(p.lane.x, p.lane.y, z)
      node.rotation.x = t * p.spin
      node.rotation.y = t * p.spin * 0.7
      node.scale.setScalar(size * 0.95)
      node.visible = opacity > 0.01

      const mesh = node.children[0] as THREE.Mesh | undefined
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial
        mat.color.copy(colour)
        mat.emissive.copy(colour)
        mat.emissiveIntensity = blocked && phase > GATE_AT ? 1.2 : 0.18
        mat.opacity = opacity
      }
    })

    // The fence brightens at the moment it stops something.
    if (ring.current) {
      const mat = ring.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.34 + checkFlash * 1.6 + intensity * 0.3
    }
    if (membrane.current) {
      const mat = membrane.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.045 + checkFlash * 0.32
      membrane.current.rotation.z = t * 0.25
    }
  })

  return (
    <group ref={group}>
      {/* --- the fence: a brass ring the calls have to pass through --- */}
      <mesh ref={ring}>
        <torusGeometry args={[PORTAL_RADIUS, 0.08, 16, isSmall ? 64 : 128]} />
        <meshStandardMaterial
          color={BRASS}
          emissive={BRASS}
          emissiveIntensity={0.34}
          roughness={0.2}
          metalness={1}
        />
      </mesh>

      {/* an inner steel collar, so the ring reads as a machined part */}
      <mesh position={[0, 0, -0.07]}>
        <torusGeometry args={[PORTAL_RADIUS - 0.17, 0.022, 10, isSmall ? 48 : 96]} />
        <meshStandardMaterial color={STEEL} roughness={0.18} metalness={1} />
      </mesh>

      {/* the check itself — a faint plane that flares when something is stopped */}
      <mesh ref={membrane}>
        <circleGeometry args={[PORTAL_RADIUS - 0.11, isSmall ? 40 : 64]} />
        <meshBasicMaterial color={BRASS} transparent opacity={0.045} side={THREE.DoubleSide} />
      </mesh>

      {/* --- the stream of tool calls --- */}
      {packets.map((p, i) => (
        <group
          key={p.offset}
          ref={(el) => {
            packetRefs.current[i] = el
          }}
        >
          <mesh>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial
              color={STEEL}
              emissive={STEEL}
              emissiveIntensity={0.18}
              roughness={0.22}
              metalness={0.85}
              transparent
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}
