import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Scene } from './Scene'
import { useMotionBudget } from '../../lib/motion/useReducedMotion'
import { usePointerField } from './usePointerField'

/**
 * The mark in 3D: the same aperture, an order of magnitude cheaper.
 * Six blades, one ring, no interior.
 */
function LogoMesh({ spin = 0.3 }: { spin?: number }) {
  const group = useRef<THREE.Group>(null)
  const { prefersReduced } = useMotionBudget()
  const pointer = usePointerField()
  const current = useRef(0)

  useFrame((state, delta) => {
    if (prefersReduced || !group.current) return
    const d = Math.min(delta, 0.05)
    const target = pointer.current.x * 0.4
    current.current += (target - current.current) * (1 - Math.exp(-5 * d))
    group.current.rotation.z = state.clock.elapsedTime * spin
    group.current.rotation.y = current.current
  })

  return (
    <group ref={group}>
      <mesh>
        <torusGeometry args={[1.5, 0.06, 10, 72]} />
        <meshStandardMaterial color="#e8b06a" roughness={0.19} metalness={1} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2
        return (
          <group key={a} position={[Math.cos(a) * 0.95, Math.sin(a) * 0.95, i * 0.01]} rotation={[0, 0, a + Math.PI / 2 - 0.4]}>
            <mesh>
              <boxGeometry args={[1.5, 0.42, 0.04]} />
              <meshStandardMaterial
                color={i === 1 ? '#e8b06a' : '#9aa1ad'}
                emissive="#e0a85c"
                emissiveIntensity={i === 1 ? 0.4 : 0}
                roughness={0.18}
                metalness={0.98}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export default function LogoScene({ spin }: { spin?: number }) {
  return (
    <Scene
      className="scene--logo"
      camera={[0, 0, 4.6]}
      fov={40}
      ariaLabel="The TaskFence mark in three dimensions: an aperture of metal blades."
    >
      <LogoMesh spin={spin} />
    </Scene>
  )
}
