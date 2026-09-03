import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '../ui/Button'
import { callTool, localTools, useConnection } from '../../lib/webmcp/adapter'
import { springSoft } from '../../lib/motion/presets'

/**
 * "Is WebMCP actually working, and how would I know?"
 *
 * This panel answers that with checks you can verify yourself rather than a
 * badge you have to trust. It reads the live browser objects on every render
 * pass, shows what was registered and through which call, and — the part that
 * actually settles it — logs every tool invocation with whether it arrived
 * through the browser's agent surface or from inside this page.
 *
 * If you ever see a row marked `webmcp`, an agent really did call this site.
 */
export function WebMCPStatus() {
  const { surface, method, toolCount, sawAgentCall, calls, clearCalls } = useConnection()
  const [probe, setProbe] = useState(() => readBrowser())
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  // Re-read the browser objects periodically: some builds attach modelContext
  // slightly after load, and an agent can connect while you are looking at this.
  useEffect(() => {
    const t = window.setInterval(() => setProbe(readBrowser()), 1500)
    return () => window.clearInterval(t)
  }, [])

  const linked = surface !== 'none'

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = (await callTool('getDelegation', { workspace: 'scholarship' })) as {
        ok?: boolean
        data?: { active?: boolean }
      }
      setTestResult(
        result?.ok
          ? `Round trip OK. The tool ran and answered — delegation currently ${result.data?.active ? 'active' : 'not started'}.`
          : 'The tool ran but returned an error result.',
      )
    } catch (err) {
      setTestResult(`Call threw: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setTesting(false)
    }
  }

  const checks = [
    {
      state: probe.navigator ? 'pass' : 'info',
      label: 'navigator.modelContext',
      detail: probe.navigator
        ? 'Present. This browser exposes the WebMCP surface.'
        : 'Not present in this browser.',
      value: probe.navigator ? 'object' : 'undefined',
    },
    {
      state: probe.document ? 'pass' : 'info',
      label: 'document.modelContext',
      detail: probe.document
        ? 'Present. TaskFence will register here.'
        : 'Not present in this browser.',
      value: probe.document ? 'object' : 'undefined',
    },
    {
      state: 'pass',
      label: 'Tools registered by this page',
      detail: `TaskFence described ${toolCount} callable tools via ${method}().`,
      value: String(toolCount),
    },
    {
      state: linked ? 'pass' : 'fail',
      label: 'Agent surface available',
      detail: linked
        ? `Registered into ${surface}. An agent in this browser can discover and call these tools now.`
        : 'No WebMCP surface here, so the tools live in an in-page registry instead. Everything on this site still works — the built-in console calls the very same functions.',
      value: linked ? surface : 'in-page registry',
    },
    {
      state: sawAgentCall ? 'pass' : 'info',
      label: 'A real agent has called a tool',
      detail: sawAgentCall
        ? 'Confirmed. At least one call arrived through the browser agent surface — see the log below.'
        : 'Not yet. Calls made from this page are marked in-page. When an agent calls in, the row will say webmcp.',
      value: sawAgentCall ? 'yes' : 'not yet',
    },
  ] as const

  return (
    <>
      <section className="diag">
        <header className="diag__head">
          <h2>WebMCP status</h2>
          <span className={`diag__verdict diag__verdict--${linked ? 'yes' : 'no'}`}>
            {linked ? `LINKED · ${surface}` : 'NO AGENT SURFACE IN THIS BROWSER'}
          </span>
        </header>

        <div className="diag__checks">
          {checks.map((c) => (
            <div key={c.label} className={`diag__check diag__check--${c.state}`}>
              <span className="diag__mark" aria-hidden="true">
                {c.state === 'pass' ? '✓' : c.state === 'fail' ? '!' : '·'}
              </span>
              <span>
                <span className="diag__label">{c.label}</span>
                <span className="diag__detail">{c.detail}</span>
              </span>
              <span className="diag__value">{c.value}</span>
            </div>
          ))}
        </div>

        <div className="diag__foot">
          <Button size="sm" variant="secondary" onClick={runTest} loading={testing}>
            Call a tool now
          </Button>
          <p>
            {testResult ??
              'Runs getDelegation through the same dispatch an agent uses, so you can see a real round trip appear in the log below.'}
          </p>
        </div>
      </section>

      <section className="calllog">
        <header className="calllog__head">
          <h3>Live tool-call log</h3>
          <span className="calllog__live">
            {calls.length ? (
              <>
                <motion.span
                  className="calllog__live-dot"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                />
                {calls.length} call{calls.length === 1 ? '' : 's'}
              </>
            ) : (
              'waiting'
            )}
            {calls.length ? (
              <button className="docs__remove" onClick={clearCalls} style={{ marginLeft: 8 }}>
                clear
              </button>
            ) : null}
          </span>
        </header>

        {calls.length === 0 ? (
          <p className="calllog__empty">
            Nothing yet. Press <strong>Call a tool now</strong> above, run the demo, or point an agent at this page —
            every invocation lands here with the route it came in on.
          </p>
        ) : (
          <ul className="calllog__list">
            <AnimatePresence initial={false}>
              {calls.map((c) => (
                <motion.li
                  key={c.id}
                  className="calllog__row"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={springSoft}
                  layout
                >
                  <span className="calllog__time">
                    {new Date(c.at).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <span className="calllog__tool">{c.tool}</span>
                  <span className="calllog__src">
                    {c.via === 'webmcp' ? 'via webmcp ✓' : 'in-page'}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </>
  )
}

function readBrowser() {
  if (typeof window === 'undefined') return { navigator: false, document: false }
  return {
    navigator: Boolean((navigator as unknown as { modelContext?: unknown }).modelContext),
    document: Boolean((document as unknown as { modelContext?: unknown }).modelContext),
    tools: localTools().length,
  }
}
