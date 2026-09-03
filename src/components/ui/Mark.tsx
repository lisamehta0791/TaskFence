/**
 * The TaskFence mark: an aperture.
 *
 * A ring that is deliberately not closed — a boundary with a controlled
 * opening, which is what the product actually is. It reads at 16px, it is one
 * shape, and it is not a picket fence.
 */
export function Mark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeDasharray="5.6 3.83"
        transform="rotate(-14 12 12)"
      />
      <circle cx="12" cy="12" r="2.8" fill="var(--accent, currentColor)" />
    </svg>
  )
}
