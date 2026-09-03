import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { backdropVariants, modalVariants } from '../../lib/motion/presets'

interface ModalProps {
  open: boolean
  onClose?: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  tone?: 'default' | 'ask' | 'deny'
  /** Approval prompts must be answered, not dismissed. */
  dismissible?: boolean
  labelledBy?: string
  size?: 'md' | 'lg'
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  tone = 'default',
  dismissible = true,
  size = 'md',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose?.()
      if (e.key !== 'Tab') return
      // Minimal focus trap: keep tabbing inside the dialog.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }, 60)

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      window.clearTimeout(t)
      ;(restoreFocus.current as HTMLElement | null)?.focus?.()
    }
  }, [open, dismissible, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="modal-root" role="presentation">
          <motion.div
            className="modal__backdrop"
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={dismissible ? onClose : undefined}
          />
          <motion.div
            ref={panelRef}
            className={`modal modal--${tone} modal--${size}`}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="modal__glow" aria-hidden="true" />
            <header className="modal__head">
              <div>
                <h2 className="modal__title">{title}</h2>
                {subtitle ? <p className="modal__subtitle">{subtitle}</p> : null}
              </div>
              {dismissible ? (
                <button className="modal__close" onClick={onClose} aria-label="Close">
                  ✕
                </button>
              ) : null}
            </header>
            <div className="modal__body">{children}</div>
            {footer ? <footer className="modal__foot">{footer}</footer> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
