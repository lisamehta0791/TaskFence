/**
 * The built-in Agent Console.
 *
 * Judges may open this site in a browser with no WebMCP surface at all. Rather
 * than shipping a fake "demo mode", the console is a *real client* of the same
 * registered tools: it calls `callTool(name, input)`, which is the exact
 * function the browser calls on an agent's behalf. Every call it makes goes
 * through the same TaskFence guard, ledger and approval flow.
 *
 * The console contains no model. Its scripted run is a fixed sequence, and its
 * free-text box is a small deterministic phrase matcher — nothing here decides
 * whether an action is permitted.
 */

import { create } from 'zustand'
import { callTool } from '../webmcp/adapter'
import { uid } from '../util/id'

export interface ConsoleMessage {
  id: string
  at: number
  role: 'human' | 'agent' | 'tool' | 'system'
  text: string
  tool?: { name: string; input: Record<string, unknown> }
  outcome?: 'ok' | 'blocked' | 'error'
}

export interface ScenarioStep {
  /** What the agent says before acting. */
  say?: string
  call?: { name: string; input?: Record<string, unknown> }
  /** Narration built from the tool result. */
  report?: (result: any) => string | void
  /** Pause before this step, ms. Purely presentational. */
  waitMs?: number
  /** Skip this step if the predicate returns false. */
  when?: () => boolean
}

interface ConsoleState {
  messages: ConsoleMessage[]
  running: boolean
  stepIndex: number
  totalSteps: number
  abort: boolean
  /** Set when a run reaches its last step. Drives the "you're done" panel. */
  finishedAt: number | null
  /** True when the run was cut short by the human. */
  stopped: boolean
  say: (role: ConsoleMessage['role'], text: string, extra?: Partial<ConsoleMessage>) => string
  run: (steps: ScenarioStep[]) => Promise<void>
  stop: () => void
  invoke: (name: string, input?: Record<string, unknown>) => Promise<unknown>
  clear: () => void
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const useAgentConsole = create<ConsoleState>((set, get) => ({
  messages: [],
  running: false,
  stepIndex: 0,
  totalSteps: 0,
  abort: false,
  finishedAt: null,
  stopped: false,

  say: (role, text, extra) => {
    const id = uid('msg')
    set((s) => ({ messages: [...s.messages, { id, at: Date.now(), role, text, ...extra }] }))
    return id
  },

  invoke: async (name, input = {}) => {
    const { say } = get()
    say('tool', `${name}(${formatInput(input)})`, { tool: { name, input } })
    const result: any = await callTool(name, input)

    if (result && result.ok === false) {
      // The agent explains the block in its own words — the human should never
      // have to read an error code to understand what just happened.
      say('agent', `${result.message ?? 'That call was blocked.'} ${result.howToProceed ?? ''}`.trim(), {
        outcome: 'blocked',
      })
    }
    return result
  },

  run: async (steps) => {
    if (get().running) return
    set({ running: true, abort: false, stepIndex: 0, totalSteps: steps.length, finishedAt: null, stopped: false })

    for (let i = 0; i < steps.length; i += 1) {
      if (get().abort) break
      const step = steps[i]
      set({ stepIndex: i })

      if (step.when && !step.when()) continue
      if (step.waitMs) await sleep(step.waitMs)
      if (get().abort) break

      if (step.say) get().say('agent', step.say)

      if (step.call) {
        const result: any = await get().invoke(step.call.name, step.call.input ?? {})
        if (step.report) {
          const line = step.report(result)
          if (line) get().say('agent', line)
        }
      }
    }

    set({ running: false, stepIndex: steps.length, finishedAt: get().abort ? null : Date.now() })
  },

  stop: () => {
    set({ abort: true, running: false, stopped: true })
    get().say('system', 'You stopped the agent.')
  },

  clear: () => set({ messages: [], stepIndex: 0, totalSteps: 0, finishedAt: null, stopped: false }),
}))

function formatInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input)
  if (!entries.length) return ''
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${truncate(v)}"` : JSON.stringify(v)}`)
    .join(', ')
}

function truncate(v: string, n = 40): string {
  return v.length > n ? `${v.slice(0, n)}…` : v
}
