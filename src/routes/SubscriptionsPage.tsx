import { motion } from 'motion/react'
import { PageTransition } from '../components/layout/PageTransition'
import { TaskIntake } from '../components/app/TaskIntake'
import { Panel } from '../components/app/Panel'
import { AgentConsole } from '../components/agent/AgentConsole'
import { AgentSwitcher } from '../components/agent/AgentSwitcher'
import { DelegationLedger } from '../components/ledger/DelegationLedger'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { subscriptionsDomain } from '../lib/domains/subscriptions'
import { subscriptionScenario } from '../lib/agent/scenarios'
import { useSubscriptionStore } from '../lib/store/subscriptionStore'
import { useTaskFenceStore } from '../lib/store/taskfenceStore'
import { useAgentConsole } from '../lib/agent/console'
import { revealChild, springSoft, staggerParent } from '../lib/motion/presets'

export default function SubscriptionsPage() {
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const reminders = useSubscriptionStore((s) => s.reminders)
  const highlight = useSubscriptionStore((s) => s.highlight)
  const reset = useSubscriptionStore((s) => s.reset)

  const resetSession = useTaskFenceStore((s) => s.resetSession)
  const contract = useTaskFenceStore((s) => s.contractFor(subscriptionsDomain.id))
  const clearConsole = useAgentConsole((s) => s.clear)
  const running = useAgentConsole((s) => s.running)

  const rulesSet = contract?.status === 'active'
  const monthly = subscriptions
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + s.priceMonthly, 0)

  return (
    <PageTransition className="workspace">
      <div className="container">
        <motion.header
          className="workspace__head"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSoft}
        >
          <div>
            <span className="eyebrow">The same thing, somewhere else</span>
            <h1 className="workspace__title">A different site. The same fence.</h1>
            <p className="lede">
              Other tools, other data, a different kind of risk — and not one line of the rule engine, the record or
              the approval flow changed to get here. That is the whole claim: this is a pattern, not a one-off.
            </p>
          </div>
          <div className="workspace__head-actions">
            <AgentSwitcher domainId={subscriptionsDomain.id} />
            <Button
              variant="ghost"
              size="sm"
              disabled={running}
              onClick={() => {
                reset()
                resetSession()
                clearConsole()
              }}
            >
              Start over
            </Button>
          </div>
        </motion.header>

        <div className="workspace__grid">
          <motion.div
            className="workspace__main"
            variants={staggerParent(0.09, 0.15)}
            initial="initial"
            animate="animate"
          >
            <Panel n={1} title="What you want done" reveal active={!rulesSet}>
              <TaskIntake domain={subscriptionsDomain} />
            </Panel>

            <Panel n={2} title="The agent at work" reveal active={rulesSet} disabled={!rulesSet}>
              {rulesSet ? (
                <AgentConsole
                  steps={subscriptionScenario}
                  title="Your agent"
                  hint="Press Start. It will downgrade what you never use and set a reminder — then stop dead at the one action that cannot be undone."
                />
              ) : (
                <p className="panel__locked">
                  Set the rules first. Until you do, this agent has no authority here either — the fence does not care
                  which site it is on.
                </p>
              )}
            </Panel>

            <motion.div className="subs" variants={revealChild}>
              <header className="subs__head">
                <h2>Your subscriptions</h2>
                <div className="subs__total">
                  <span className="muted">Active spend</span>
                  <motion.strong key={monthly} initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={springSoft}>
                    {monthly.toFixed(2)} / month
                  </motion.strong>
                </div>
              </header>

              <div className="subs__list">
                {subscriptions.map((s, i) => (
                  <motion.div
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springSoft, delay: i * 0.04 }}
                  >
                    <Card
                      tone={s.status === 'cancelled' ? 'deny' : s.status === 'paused' ? 'ask' : 'default'}
                      className={`sub ${highlight === s.id ? 'is-highlight' : ''}`}
                    >
                      <div className="sub__top">
                        <div>
                          <h3 className="sub__name">{s.name}</h3>
                          <p className="muted">
                            {s.category} · last used {s.lastUsed}
                          </p>
                        </div>
                        <Badge tone={s.status === 'active' ? 'allow' : s.status === 'paused' ? 'ask' : 'deny'}>
                          {s.status}
                        </Badge>
                      </div>
                      <div className="sub__meta">
                        <span>
                          <span className="muted">Plan</span>
                          <strong>{s.plan}</strong>
                        </span>
                        <span>
                          <span className="muted">Monthly</span>
                          <strong>{s.priceMonthly.toFixed(2)}</strong>
                        </span>
                        <span>
                          <span className="muted">Renews</span>
                          <strong>{s.renewsOn}</strong>
                        </span>
                      </div>
                      {reminders[s.id] ? (
                        <motion.p
                          className="sub__reminder"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          Reminder set: {reminders[s.id]}
                        </motion.p>
                      ) : null}
                    </Card>
                  </motion.div>
                ))}
              </div>
              <p className="muted subs__note">
                Made-up services, made-up prices. There is no payment processing anywhere in this project.
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            className="workspace__side"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...springSoft, delay: 0.28 }}
          >
            <DelegationLedger domain={subscriptionsDomain} />
          </motion.div>
        </div>
      </div>
    </PageTransition>
  )
}
