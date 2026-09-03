import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { PageTransition } from '../components/layout/PageTransition'
import { TaskIntake } from '../components/app/TaskIntake'
import { ApplicationForm } from '../components/app/ApplicationForm'
import { DocumentPanel } from '../components/app/DocumentPanel'
import { WorkspacePicker } from '../components/app/WorkspacePicker'
import { AgentConsole } from '../components/agent/AgentConsole'
import { AgentSwitcher } from '../components/agent/AgentSwitcher'
import { DelegationLedger } from '../components/ledger/DelegationLedger'
import { WorkflowSteps, type Stage, type StageId } from '../components/app/WorkflowSteps'
import { CompletionPanel } from '../components/app/CompletionPanel'
import { Panel } from '../components/app/Panel'
import { Button } from '../components/ui/Button'
import { DEFAULT_DOMAIN_ID, FORM_DOMAINS, formDomainById, useRecordStore } from '../lib/domains'
import { formScenario } from '../lib/agent/scenarios'
import { useTaskFenceStore } from '../lib/store/taskfenceStore'
import { useAgentConsole } from '../lib/agent/console'
import { revealChild, springSoft, staggerParent } from '../lib/motion/presets'

/**
 * The workspace.
 *
 * One page, several workspaces. Switching between them swaps the form, the
 * documents and the agent's tools — and touches nothing in the rule engine, the
 * record or the approval flow. The scholarship is not special here; it is one
 * config object among several, which is the honest answer to "is this just a
 * scholarship app?".
 */
export default function DemoPage() {
  const [domainId, setDomainId] = useState(DEFAULT_DOMAIN_ID)
  const domain = formDomainById(domainId)
  const store = useRecordStore(domainId)

  const documents = store((s) => s.documents)
  const fields = store((s) => s.fields)
  const resetRecord = store((s) => s.reset)

  const resetSession = useTaskFenceStore((s) => s.resetSession)
  const contract = useTaskFenceStore((s) => s.contractFor(domainId))

  const clearConsole = useAgentConsole((s) => s.clear)
  const run = useAgentConsole((s) => s.run)
  const running = useAgentConsole((s) => s.running)
  const finishedAt = useAgentConsole((s) => s.finishedAt)
  const stopped = useAgentConsole((s) => s.stopped)

  const formRef = useRef<HTMLDivElement>(null)
  const [sideTab, setSideTab] = useState<'activity' | 'delegation' | 'export'>('activity')

  const userDefined = Boolean(domain.form?.userDefined)
  // A user-defined workspace is only ready once it has fields to fill.
  const ready = userDefined ? fields.length > 0 : documents.some((d) => d.readable)
  const rulesSet = contract?.status === 'active'
  const isDone = Boolean(finishedAt) || stopped

  const stage: StageId = !rulesSet ? (ready ? 'rules' : 'documents') : isDone ? 'done' : 'working'

  const stages: Stage[] = useMemo(
    () => [
      {
        id: 'documents',
        n: 1,
        title: userDefined ? 'Set up your record' : 'Add your documents',
        hint: userDefined ? 'Add fields, or take them from a document' : 'Or use the samples already here',
        done: ready,
      },
      {
        id: 'rules',
        n: 2,
        title: 'Say what you want done',
        hint: 'Including anything it must not touch',
        done: rulesSet,
      },
      {
        id: 'working',
        n: 3,
        title: 'Let the agent work',
        hint: 'It stops and asks when it needs you',
        done: isDone,
      },
      { id: 'done', n: 4, title: 'Check and change', hint: 'Nothing is final until you say so', done: false },
    ],
    [ready, rulesSet, isDone, userDefined],
  )

  const switchWorkspace = (id: string) => {
    if (running) return
    clearConsole()
    setDomainId(id)
  }

  const resetAll = () => {
    resetRecord()
    resetSession()
    clearConsole()
  }

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => {
      formRef.current?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus()
    }, 500)
  }

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
            <span className="eyebrow">Live workspace</span>
            <h1 className="workspace__title">Give an agent the job. Keep the say-so.</h1>
            <p className="lede">
              A real form, your real documents, and a real AI agent filling it in. You decide up front what it may
              touch — and it has to come back to you for anything else.
            </p>
          </div>
          <div className="workspace__head-actions">
            <AgentSwitcher domainId={domainId} />
            <Button variant="ghost" size="sm" onClick={resetAll} disabled={running}>
              Start over
            </Button>
          </div>
        </motion.header>

        <WorkspacePicker
          domains={FORM_DOMAINS}
          activeId={domainId}
          onChange={switchWorkspace}
          disabled={running}
        />

        <WorkflowSteps stages={stages} current={stage} />

        <div className="workspace__grid">
          <motion.div
            key={domainId}
            className="workspace__main"
            variants={staggerParent(0.09, 0.1)}
            initial="initial"
            animate="animate"
          >
            <Panel
              n={1}
              title={userDefined ? 'Your record and documents' : 'Your documents'}
              reveal
              active={stage === 'documents'}
            >
              <DocumentPanel domain={domain} />
            </Panel>

            <Panel n={2} title="What you want done" reveal active={stage === 'rules'}>
              <TaskIntake domain={domain} />
            </Panel>

            <Panel n={3} title="The agent at work" reveal active={stage === 'working'} disabled={!rulesSet}>
              {rulesSet ? (
                <AgentConsole
                  steps={() => formScenario(domain)}
                  title="Your agent"
                  hint="Press Start. It will read your documents, fill what it can, and stop the moment it needs a decision from you."
                />
              ) : (
                <p className="panel__locked">
                  Finish step 2 first. Until you have said what you want done, the agent has no authority here — every
                  call it makes is refused.
                </p>
              )}
            </Panel>

            <AnimatePresence>
              {isDone ? (
                <CompletionPanel
                  key="done"
                  domain={domain}
                  onSeeRecord={() => {
                    setSideTab('activity')
                    document.querySelector('.ledger')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  onEditYourself={scrollToForm}
                  onRunAgain={() => {
                    clearConsole()
                    void run(formScenario(domain))
                  }}
                />
              ) : null}
            </AnimatePresence>

            <motion.div ref={formRef} variants={revealChild}>
              <ApplicationForm domain={domain} />
            </motion.div>
          </motion.div>

          <motion.div
            className="workspace__side"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...springSoft, delay: 0.28 }}
          >
            <DelegationLedger domain={domain} tab={sideTab} onTabChange={setSideTab} />
          </motion.div>
        </div>
      </div>
    </PageTransition>
  )
}
