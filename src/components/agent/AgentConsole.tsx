import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '../ui/Button'
import { useAgentConsole } from '../../lib/agent/console'
import { interpret } from '../../lib/agent/scenarios'
import { useConnection } from '../../lib/webmcp/adapter'
import type { ScenarioStep } from '../../lib/agent/console'
import { listItemVariants, springSoft } from '../../lib/motion/presets'

/**
 * Built-in Agent Console.
 *
 * This is a *client* of the registered WebMCP tools, not a simulation of them.
 * It exists so the demo works in any browser, and so the same run can be shown
 * side by side with a real agent in ChatGPT's in-app browser.
 */
export function AgentConsole({
  steps,
  title = 'Agent',
  hint,
}: {
  steps: () => ScenarioStep[]
  title?: string
  hint?: string
}) {
  const messages = useAgentConsole((s) => s.messages)
  const running = useAgentConsole((s) => s.running)
  const stepIndex = useAgentConsole((s) => s.stepIndex)
  const totalSteps = useAgentConsole((s) => s.totalSteps)
  const run = useAgentConsole((s) => s.run)
  const stop = useAgentConsole((s) => s.stop)
  const clear = useAgentConsole((s) => s.clear)
  const say = useAgentConsole((s) => s.say)
  const invoke = useAgentConsole((s) => s.invoke)
  const live = useConnection((s) => s.surface !== 'none')

  const [input, setInput] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    // Not every embedded browser implements Element.scrollTo.
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    else el.scrollTop = el.scrollHeight
  }, [messages.length])

  const send = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    say('human', text)
    const call = interpret(text)
    if (!call) {
      say(
        'agent',
        'I understand a few plain phrases — try "read application", "list documents", "set gpa to 3.9", "submit", or "why was that blocked?". For real conversation, connect ChatGPT using the button in the header.',
      )
      return
    }
    await invoke(call.name, call.input)
  }

  return (
    <section className="console">
      <header className="console__head">
        <div className="console__title">
          <span className={`console__status ${running ? 'is-running' : ''}`} aria-hidden="true" />
          <h3>{title}</h3>
          {/*
            Honesty about what this panel is. The tools are real WebMCP tools
            and the decisions are real, but the caller here is a scripted
            walkthrough, not a language model — so it must not be labelled as
            though a live agent were driving it.
          */}
          <span className="console__mode">
            {live
              ? 'scripted walkthrough · a real agent is also connected'
              : 'scripted walkthrough · calling this page’s real WebMCP tools'}
          </span>
        </div>
        <div className="console__controls">
          {running ? (
            <Button size="sm" variant="danger" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => run(steps())}>
              Start the agent
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={clear} disabled={running}>
            Clear
          </Button>
        </div>
      </header>

      {running ? (
        <div className="console__progress" aria-hidden="true">
          <motion.span
            className="console__progress-bar"
            animate={{ scaleX: totalSteps ? (stepIndex + 1) / totalSteps : 0 }}
            transition={springSoft}
          />
        </div>
      ) : null}

      <div className="console__log" ref={scroller}>
        {messages.length === 0 ? (
          <p className="console__empty">
            {hint ??
              'Press Start. It does real work on its own, then stops the moment it wants to do something you did not allow — and hands that decision to you.'}
          </p>
        ) : null}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              className={`msg msg--${m.role} ${m.outcome ? `msg--${m.outcome}` : ''}`}
              variants={listItemVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              layout
            >
              {m.role === 'tool' ? (
                <>
                  <span className="msg__tag">tool call</span>
                  <code className="msg__code">{m.text}</code>
                </>
              ) : (
                <>
                  <span className="msg__tag">{m.role === 'human' ? 'you' : m.role === 'system' ? 'system' : 'agent'}</span>
                  <p className="msg__text">{m.text}</p>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <form
        className="console__input"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Talk to the agent — try "read application" or "set gpa to 3.9"'
          aria-label="Send an instruction to the agent"
        />
        <Button size="sm" type="submit" variant="secondary">
          Send
        </Button>
      </form>

      <p className="console__disclosure">
        This panel is a scripted walkthrough, not a language model — so the demo is the same every time. What it
        calls is real: the same <code>navigator.modelContext</code> tools this page registers for any WebMCP agent,
        and every decision you see comes from the policy engine, not from a script.
      </p>
    </section>
  )
}
