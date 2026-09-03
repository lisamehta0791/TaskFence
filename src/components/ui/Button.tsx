import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import { Link } from 'react-router-dom'
import { press, springPress } from '../../lib/motion/presets'

const MotionLink = motion.create(Link)

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface CommonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconEnd?: ReactNode
  full?: boolean
  loading?: boolean
  /** Adds a trailing arrow that slides forward on hover. */
  arrow?: boolean
  children?: ReactNode
  className?: string
}

type ButtonProps = CommonProps &
  Omit<HTMLMotionProps<'button'>, 'children' | 'ref'> &
  Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled'>

function classes({ variant = 'primary', size = 'md', full, className }: CommonProps): string {
  return ['btn', `btn--${variant}`, `btn--${size}`, full ? 'btn--full' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
}

/** The arrow is its own motion child so it can move independently of the lift. */
function Arrow() {
  return (
    <motion.span
      className="btn__arrow"
      variants={{ rest: { x: 0 }, hover: { x: 4 } }}
      transition={springPress}
      aria-hidden="true"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M2.5 7h9M8 3.5 11.5 7 8 10.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </motion.span>
  )
}

/**
 * The single button in the system.
 *
 * Hover, tap and focus are driven by one spring so every control in the app
 * responds identically. `whileHover="hover"` propagates to children, which is
 * what lets the arrow slide while the button itself lifts.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, iconEnd, full, loading, arrow, children, className, disabled, ...rest },
  ref,
) {
  const inert = disabled || loading

  return (
    <motion.button
      ref={ref}
      className={classes({ variant, size, full, className })}
      disabled={inert}
      initial="rest"
      animate="rest"
      whileHover={inert ? undefined : 'hover'}
      whileTap={inert ? undefined : 'tap'}
      variants={{ rest: { y: 0, scale: 1 }, hover: press.hover, tap: press.tap }}
      transition={springPress}
      {...rest}
    >
      <span className="btn__shine" aria-hidden="true" />
      {loading ? <span className="btn__spinner" aria-hidden="true" /> : icon}
      {children ? <span className="btn__label">{children}</span> : null}
      {arrow ? <Arrow /> : iconEnd}
    </motion.button>
  )
})

type ButtonLinkProps = CommonProps & { to: string; external?: boolean }

export function ButtonLink({ to, external, icon, iconEnd, arrow, children, ...rest }: ButtonLinkProps) {
  const cls = classes({ ...rest, className: rest.className })

  const motionProps = {
    initial: 'rest' as const,
    animate: 'rest' as const,
    whileHover: 'hover' as const,
    whileTap: 'tap' as const,
    variants: { rest: { y: 0, scale: 1 }, hover: press.hover, tap: press.tap },
    transition: springPress,
  }

  const inner = (
    <>
      <span className="btn__shine" aria-hidden="true" />
      {icon}
      <span className="btn__label">{children}</span>
      {arrow ? <Arrow /> : iconEnd}
    </>
  )

  if (external) {
    return (
      <motion.a href={to} target="_blank" rel="noreferrer noopener" className={cls} {...motionProps}>
        {inner}
      </motion.a>
    )
  }

  return (
    <MotionLink to={to} className={cls} {...motionProps}>
      {inner}
    </MotionLink>
  )
}
