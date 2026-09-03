import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { springSnappy } from '../../lib/motion/presets'

export type BadgeTone = 'allow' | 'ask' | 'deny' | 'neutral' | 'brand' | 'accent'

export function Badge({
  tone = 'neutral',
  children,
  icon,
  pulse,
  className,
}: {
  tone?: BadgeTone
  children: ReactNode
  icon?: ReactNode
  pulse?: boolean
  className?: string
}) {
  return (
    <motion.span
      layout
      className={`badge badge--${tone} ${className ?? ''}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springSnappy}
    >
      {pulse ? <span className="badge__pulse" aria-hidden="true" /> : null}
      {icon ? <span className="badge__icon">{icon}</span> : null}
      {children}
    </motion.span>
  )
}

/** The three policy states, rendered identically everywhere they appear. */
export function DecisionBadge({ decision }: { decision: 'ALLOW' | 'DENY' | 'ASK' }) {
  const map = {
    ALLOW: { tone: 'allow' as const, label: 'Allowed', icon: '✓' },
    DENY: { tone: 'deny' as const, label: 'Blocked', icon: '✕' },
    ASK: { tone: 'ask' as const, label: 'Needs you', icon: '❚❚' },
  }
  const m = map[decision]
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {m.label}
    </Badge>
  )
}
