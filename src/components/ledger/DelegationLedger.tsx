import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Badge } from '../ui/Badge'
import { Mark } from '../ui/Mark'
import { Button } from '../ui/Button'
import { ContractView } from './ContractView'
import { ExportPanel } from './ExportPanel'
import { useTaskFenceStore } from '../../lib/store/taskfenceStore'
import type { DomainSpec } from '../../lib/domains/types'
import type { LedgerEntry } from '../../lib/policy/types'
import { listItemVariants, springSoft } from '../../lib/motion/presets'

export type LedgerTab = 'activity' | 'delegation' | 'export'

const TAB_LABEL: Record<LedgerTab, string> = {
  activity: 'What it did',
  delegation: 'Its rules',
  export: 'Record',
}

/**
 * The Delegation Ledger.
 *
 * Design brief from the project document: this should read like a to-do list
 * the human can glance at, not an alert-heavy security console. Ticks for work
 * done inside the boundary, a clear pause state for anything waiting on them,
 * and plain-language reasons — never a raw error code.
 */
export function DelegationLedger({
  domain,
  tab: controlledTab,
  onTabChange,
}: {
  domain: DomainSpec
  tab?: LedgerTab
  onTabChange?: (tab: LedgerTab) => void
}) {
  const [ownTab, setOwnTab] = useState<LedgerTab>('activity')
  const tab = controlledTab ?? ownTab
  const setTab = (t: LedgerTab) => {
    setOwnTab(t)
    onTabChange?.(t)
  }

  const contract = useTaskFenceStore((s) => s.contractFor(domain.id))
  const contracts = useTaskFenceStore((s) => s.contracts)
  const ledger = useTaskFenceStore((s) => s.ledger)
  const agents = useTaskFenceStore((s) => s.agents)
  const activeAgentId = useTaskFenceStore((s) => s.activeAgentId)
  const narrow = useTaskFenceStore((s) => s.narrowDelegation)
  const revoke = useTaskFenceStore((s) => s.revokeDelegation)

  const agent = agents.find((a) => a.id === activeAgentId)
  const taskKey = `${activeAgentId}::${domain.id}`
  const entries = useMemo(() => ledger.filter((e) => e.taskId === taskKey), [ledger, taskKey])
  const pending = entries.filter((e) => e.status === 'awaiting-approval')

  /* ---- Replay -----------------------------------------------------------
     Scrubbing does not re-run anything. It slices the record, and rebuilds the
     rules as they stood at that moment from each rule's own createdAt /
     retiredAt stamps — so "what was it allowed to do at the time?" is answered
     from the log rather than from memory. */
  const cursor = useTaskFenceStore((s) => s.replayIndex)
  const setReplayIndex = useTaskFenceStore((s) => s.setReplayIndex)

  const index = cursor ?? entries.length - 1
  const visible = cursor === null ? entries : entries.slice(0, Math.max(0, index + 1))
  const rewound = cursor !== null && cursor < entries.length - 1
  const asOf = visible.length ? visible[visible.length - 1].at : Date.now()

  const contractAsOf = useMemo(() => {
    if (!contract || !rewound) return contract
    return {
      ...contract,
      rules: contract.rules
        .filter((r) => r.createdAt <= asOf)
        .map((r) => (r.retiredAt && r.retiredAt <= asOf ? r : { ...r, retiredAt: null })),
    }
  }, [contract, rewound, asOf])

  /** Other agents holding rules on this same task — proof grants do not leak. */
  const otherAgents = agents.filter(
    (a) => a.id !== activeAgentId && Boolean(contracts[`${a.id}::${domain.id}`]),
  )

  return (
    <aside className="ledger" aria-label="Delegation ledger">
      <header className="ledger__head">
        <div className="ledger__title">
          <span className="ledger__logo" aria-hidden="true">
            <Mark size={15} />
          </span>
          <div>
            <h3>Your agent</h3>
            <p className="ledger__task">{domain.taskTitle}</p>
          </div>
        </div>

        <div className="ledger__session">
          <span className="ledger__agent" style={{ ['--agent-color' as string]: agent?.color }}>
            <span className="ledger__agent-dot" />
            {agent?.name}
          </span>
          <Badge tone={contract?.status === 'active' ? 'allow' : 'neutral'} pulse={contract?.status === 'active'}>
            {contract ? statusLabel(contract.status) : 'No rules yet'}
          </Badge>
        </div>
      </header>

      <nav className="ledger__tabs" role="tablist">
        {(['activity', 'delegation', 'export'] as LedgerTab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`ledger__tab ${tab === t ? 'is-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {tab === t ? (
              <motion.span layoutId="ledger-tab" className="ledger__tab-pill" transition={springSoft} />
            ) : null}
            <span>{TAB_LABEL[t]}</span>
            {t === 'activity' && pending.length ? <span className="ledger__tab-count">{pending.length}</span> : null}
          </button>
        ))}
      </nav>

      <div className="ledger__body">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {tab === 'activity' ? (
              <>
                <Replay entries={entries} index={cursor} onScrub={setReplayIndex} />
                <ActivityList entries={visible} hasContract={Boolean(contract)} />
              </>
            ) : null}

            {tab === 'delegation' ? (
              contract ? (
                <>
                  {rewound ? (
                    <p className="ledger__rewound">
                      Showing the rules as they stood at {new Date(asOf).toLocaleTimeString()}, not as they are now.
                    </p>
                  ) : null}
                  <ContractView
                    contract={contractAsOf ?? contract}
                    onWithdraw={rewound ? undefined : (id) => narrow(domain.id, id)}
                  />
                  {otherAgents.length ? (
                    <p className="ledger__scope">
                      {otherAgents.map((a) => a.name).join(' and ')}{' '}
                      {otherAgents.length === 1 ? 'has' : 'have'} separate rules on this task. Nothing you grant here
                      reaches {otherAgents.length === 1 ? 'it' : 'them'} — switch acting agent above to see.
                    </p>
                  ) : null}
                  {contract.status === 'active' && !rewound ? (
                    <div className="ledger__revoke">
                      <Button variant="ghost" size="sm" onClick={() => revoke(domain.id)}>
                        Withdraw everything now
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <Empty text="No rules yet. Say what you want done in step 2 and they will appear here." />
              )
            ) : null}

            {tab === 'export' ? (
              contract ? (
                <ExportPanel contract={contract} />
              ) : (
                <Empty text="Nothing to show until you have set the rules." />
              )
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  )
}

/**
 * The replay scrubber. Only appears once there is something to rewind through,
 * so it never adds noise to an empty panel.
 */
function Replay({
  entries,
  index,
  onScrub,
}: {
  entries: LedgerEntry[]
  index: number | null
  onScrub: (i: number | null) => void
}) {
  if (entries.length < 2) return null
  const live = index === null
  const value = index ?? entries.length - 1

  return (
    <div className="replaybar">
      <label htmlFor="replay-scrub" className="replaybar__label">
        Replay
      </label>
      <input
        id="replay-scrub"
        className="replaybar__range"
        type="range"
        min={0}
        max={entries.length - 1}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value)
          onScrub(next >= entries.length - 1 ? null : next)
        }}
      />
      <span className="replaybar__count">
        {value + 1}/{entries.length}
      </span>
      {!live ? (
        <button className="replaybar__live" onClick={() => onScrub(null)}>
          live
        </button>
      ) : null}
    </div>
  )
}

function ActivityList({ entries, hasContract }: { entries: LedgerEntry[]; hasContract: boolean }) {
  if (!entries.length) {
    return (
      <Empty
        text={
          hasContract
            ? 'Nothing yet. Every single thing your agent does appears here, in order, with the reason it was allowed or stopped.'
            : 'Say what you want done in step 2. After that, every move your agent makes shows up here.'
        }
      />
    )
  }

  return (
    <ol className="ledger__list">
      <AnimatePresence initial={false}>
        {entries.map((e) => (
          <motion.li
            key={e.id}
            className={`ledger__item ledger__item--${e.status}`}
            variants={listItemVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            layout
          >
            <span className="ledger__icon" aria-hidden="true">
              {icon(e.status)}
            </span>
            <div className="ledger__content">
              <p className="ledger__item-title">
                {e.title}
                {e.durationMs !== undefined ? <span className="ledger__ms">{e.durationMs}ms</span> : null}
              </p>
              {e.detail ? <p className="ledger__detail">{e.detail}</p> : null}
              {e.status !== 'allowed' ? <p className="ledger__reason">{e.reason}</p> : null}
              <p className="ledger__meta">
                <code>{e.tool}</code>
                <span>{new Date(e.at).toLocaleTimeString()}</span>
              </p>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="ledger__empty">{text}</p>
}

function icon(status: LedgerEntry['status']): string {
  switch (status) {
    case 'allowed':
      return '✓'
    case 'approved-with-exception':
      return '✓'
    case 'denied':
      return '✕'
    case 'refused-by-human':
      return '✕'
    case 'awaiting-approval':
      return '❚❚'
    case 'error':
      return '!'
    default:
      return '·'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Rules in force'
    case 'draft':
      return 'Waiting for you'
    case 'completed':
      return 'Finished'
    case 'revoked':
      return 'Withdrawn'
    default:
      return status
  }
}
