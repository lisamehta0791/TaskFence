import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { APPROVAL_TIMEOUT_MS, useTaskFenceStore } from '../../lib/store/taskfenceStore'
import { fieldLabel } from '../../lib/domains'

/**
 * The Approval Manager.
 *
 * Mounted once, at the app root, because an approval can be triggered by a tool
 * call from anywhere — including from an agent in another tab of ChatGPT's
 * browser while the human is looking at a different page of this site.
 *
 * The prompt does three things the design doc insists on:
 *   1. explains in plain language what was attempted and why it paused,
 *   2. lets the human *amend* the value rather than only accept or refuse,
 *   3. shows precisely what will be granted, before they grant it.
 */
export function ApprovalManager() {
  const approvals = useTaskFenceStore((s) => s.approvals)
  const resolveApproval = useTaskFenceStore((s) => s.resolveApproval)

  const pending = useMemo(() => approvals.find((a) => a.status === 'pending'), [approvals])

  const [value, setValue] = useState('')
  const [remaining, setRemaining] = useState(APPROVAL_TIMEOUT_MS)

  const proposedValue = typeof pending?.request.args.value === 'string' ? pending.request.args.value : ''
  const isWrite = pending?.request.operation === 'WRITE'

  useEffect(() => {
    setValue(proposedValue)
  }, [pending?.id, proposedValue])

  useEffect(() => {
    if (!pending) return
    const tick = () => setRemaining(Math.max(0, pending.createdAt + APPROVAL_TIMEOUT_MS - Date.now()))
    tick()
    const t = window.setInterval(tick, 500)
    return () => window.clearInterval(t)
  }, [pending?.id, pending?.createdAt, pending])

  if (!pending) return null

  const req = pending.request
  const denied = pending.decision.decision === 'DENY'
  const amended = isWrite && value !== proposedValue
  const secondsLeft = Math.ceil(remaining / 1000)

  const allow = (scope: 'exact' | 'tool') =>
    resolveApproval(pending.id, {
      approved: true,
      scope,
      uses: scope === 'exact' ? 1 : 3,
      amendedArgs: amended ? { value } : undefined,
    })

  return (
    <Modal
      open
      dismissible={false}
      tone={denied ? 'deny' : 'ask'}
      size="lg"
      title={denied ? 'Your agent is asking to cross a line you drew' : 'Your agent needs your decision'}
      subtitle={pending.question}
      footer={
        <div className="approval__actions">
          <Button variant="ghost" onClick={() => resolveApproval(pending.id, { approved: false })}>
            No, don’t
          </Button>
          <div className="approval__actions-right">
            <Button variant="secondary" onClick={() => allow('tool')}>
              Allow {req.tool} · 3×
            </Button>
            <Button variant={denied ? 'danger' : 'success'} onClick={() => allow('exact')} data-autofocus>
              {amended ? 'Allow my version, once' : 'Allow once'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="approval">
        <div className="approval__grid">
          <div className="approval__cell">
            <span className="approval__k">Agent</span>
            <span className="approval__v">{agentName(req.agentId)}</span>
          </div>
          <div className="approval__cell">
            <span className="approval__k">Tool</span>
            <code className="approval__v">{req.tool}</code>
          </div>
          <div className="approval__cell">
            <span className="approval__k">Action</span>
            <span className="approval__v">{req.operation}</span>
          </div>
          {req.field ? (
            <div className="approval__cell">
              <span className="approval__k">Field</span>
              <span className="approval__v">{fieldLabel(req.field)}</span>
            </div>
          ) : null}
        </div>

        <div className={`approval__reason approval__reason--${denied ? 'deny' : 'ask'}`}>
          <Badge tone={denied ? 'deny' : 'ask'}>{denied ? 'Off limits' : 'Needs approval'}</Badge>
          <p>{pending.decision.reason}</p>
        </div>

        {isWrite ? (
          <label className="approval__field">
            <span className="approval__k">
              Value the agent proposed — edit it if it is wrong, and your version is what gets written
            </span>
            <input
              className="approval__input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              spellCheck={false}
            />
            {amended ? (
              <motion.span
                className="approval__amended"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                You changed this. “{proposedValue}” will not be written.
              </motion.span>
            ) : null}
          </label>
        ) : null}

        <div className="approval__grant">
          <h4>If you allow it, this is exactly what is granted</h4>
          <pre className="approval__code">
{`ALLOW
  tool:     ${req.tool}
  field:    ${req.field ?? '—'}
  action:   ${req.operation}
  agent:    ${agentName(req.agentId)}
  uses:     1
  expires:  immediately after this one call`}
          </pre>
          <p className="muted">
            Nothing else is unlocked. The next identical call will pause again.
          </p>
        </div>

        <div className="approval__timer" aria-live="polite">
          <motion.span
            className="approval__timer-bar"
            initial={{ scaleX: 1 }}
            animate={{ scaleX: remaining / APPROVAL_TIMEOUT_MS }}
            transition={{ ease: 'linear', duration: 0.5 }}
          />
          <span className="muted">
            The agent is paused, waiting for you. If you do nothing for {secondsLeft}s it is refused by default.
          </span>
        </div>
      </div>
    </Modal>
  )
}

function agentName(agentId: string): string {
  return useTaskFenceStore.getState().agents.find((a) => a.id === agentId)?.name ?? agentId
}
