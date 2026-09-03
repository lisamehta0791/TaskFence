import { motion } from 'motion/react'
import { contractSummary, describeMatcher } from '../../lib/policy/contract'
import type { DelegationContract, Rule } from '../../lib/policy/types'
import { Badge } from '../ui/Badge'

/**
 * The delegation, in the human's language.
 *
 * Three lists, exactly as the contract stores them: allowed, off limits, needs
 * approval — plus any live exceptions, which are shown separately so a granted
 * one-off never hides inside the standing permissions.
 */
export function ContractView({
  contract,
  onWithdraw,
  compact,
}: {
  contract: DelegationContract
  onWithdraw?: (ruleId: string) => void
  compact?: boolean
}) {
  const s = contractSummary(contract)
  const liveExceptions = s.exceptions.filter((r) => !r.retiredAt)
  const spentExceptions = s.exceptions.filter((r) => r.retiredAt)

  return (
    <div className={`contract ${compact ? 'contract--compact' : ''}`}>
      {!compact ? (
        <blockquote className="contract__statement">
          <span className="contract__quote">“</span>
          {contract.statement}
        </blockquote>
      ) : null}

      <Group title="Your agent may" tone="allow" rules={s.allowed} onWithdraw={onWithdraw} />
      <Group title="Off limits" tone="deny" rules={s.forbidden} onWithdraw={onWithdraw} />
      <Group title="Needs your approval" tone="ask" rules={s.requiresApproval} onWithdraw={onWithdraw} />

      {liveExceptions.length ? (
        <Group title="One-off permissions you granted" tone="brand" rules={liveExceptions} exception />
      ) : null}

      {spentExceptions.length ? (
        <div className="contract__group">
          <h4 className="contract__group-title">
            <Badge tone="neutral">Used up</Badge>
            <span>Exceptions that have already expired</span>
          </h4>
          <ul className="contract__list contract__list--spent">
            {spentExceptions.map((r) => (
              <li key={r.id}>
                <span className="contract__rule-label">{r.label}</span>
                <span className="muted"> — used once, then closed</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function Group({
  title,
  tone,
  rules,
  onWithdraw,
  exception,
}: {
  title: string
  tone: 'allow' | 'deny' | 'ask' | 'brand'
  rules: Rule[]
  onWithdraw?: (ruleId: string) => void
  exception?: boolean
}) {
  if (!rules.length) return null

  return (
    <div className="contract__group">
      <h4 className="contract__group-title">
        <Badge tone={tone}>{rules.length}</Badge>
        <span>{title}</span>
      </h4>
      <ul className="contract__list">
        {rules.map((r, i) => (
          <motion.li
            key={r.id}
            className={`contract__rule contract__rule--${tone}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <div className="contract__rule-main">
              <span className="contract__rule-label">{r.label}</span>
              <span className="contract__rule-scope">{describeMatcher(r.match)}</span>
              {exception && r.uses !== null ? (
                <span className="contract__rule-uses">{r.uses} use{r.uses === 1 ? '' : 's'} left</span>
              ) : null}
              {r.origin === 'default' ? (
                <span className="contract__rule-origin">added by TaskFence, not by your sentence</span>
              ) : null}
            </div>
            {onWithdraw && r.origin !== 'default' ? (
              <button className="contract__withdraw" onClick={() => onWithdraw(r.id)} title="Withdraw this permission">
                withdraw
              </button>
            ) : null}
          </motion.li>
        ))}
      </ul>
    </div>
  )
}
