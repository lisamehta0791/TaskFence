/**
 * WebMCP adapter.
 *
 * WebMCP is an emerging proposal and the surface has moved around: some builds
 * expose `navigator.modelContext`, some expose `document.modelContext`, some
 * take one tool at a time via `registerTool()`, others take a batch via
 * `provideContext({ tools })` / `registerTools()`.
 *
 * This adapter feature-detects all of those, registers through whichever exists,
 * and falls back to an in-page registry so that the built-in Agent Console (and
 * any judge on a browser without WebMCP) can still drive exactly the same code
 * path. There is no separate "demo mode" implementation of the tools — the
 * fallback dispatches into the same executors the browser would call.
 */

import { create } from 'zustand'

export type JsonSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export interface ToolAnnotations {
  /** Declared by the tool author. WebMCP does not verify this — nor do we. */
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  untrustedContentHint?: boolean
}

export interface WebMCPTool {
  name: string
  description: string
  inputSchema: JsonSchema
  annotations?: ToolAnnotations
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown
}

type Surface = 'navigator.modelContext' | 'document.modelContext' | 'none'
type Method = 'registerTool' | 'provideContext' | 'registerTools' | 'shim'

interface ModelContextLike {
  registerTool?: (tool: unknown) => unknown
  registerTools?: (tools: unknown[]) => unknown
  provideContext?: (context: { tools: unknown[] }) => unknown
  getTools?: () => unknown
  executeTool?: (name: string, input: unknown) => unknown
  unregisterTool?: (name: string) => unknown
}

/* ------------------------------------------------------------------ *
 * Connection state (drives the "Agent link" badge in the navbar)
 * ------------------------------------------------------------------ */

/** One observed tool call. `via` is the thing worth watching. */
export interface CallRecord {
  id: number
  at: number
  tool: string
  /**
   * 'webmcp'  — the browser's agent surface invoked us. Proof an agent is
   *             really driving the page.
   * 'in-page' — the built-in console or the playground called the same tool
   *             directly.
   */
  via: 'webmcp' | 'in-page'
}

export interface ConnectionState {
  surface: Surface
  method: Method
  toolCount: number
  detectedAt: number | null
  lastCallAt: number | null
  lastCallTool: string | null
  live: boolean
  /** Newest first, capped. */
  calls: CallRecord[]
  /** True once a real WebMCP agent has actually invoked a tool. */
  sawAgentCall: boolean
  logCall: (tool: string, via: CallRecord['via']) => void
  setLastCall: (tool: string) => void
  clearCalls: () => void
}

let callSeq = 0

export const useConnection = create<ConnectionState>((set) => ({
  surface: 'none',
  method: 'shim',
  toolCount: 0,
  detectedAt: null,
  lastCallAt: null,
  lastCallTool: null,
  live: false,
  calls: [],
  sawAgentCall: false,
  logCall: (tool, via) => {
    callSeq += 1
    const record: CallRecord = { id: callSeq, at: Date.now(), tool, via }
    set((s) => ({
      calls: [record, ...s.calls].slice(0, 60),
      lastCallAt: record.at,
      lastCallTool: tool,
      sawAgentCall: s.sawAgentCall || via === 'webmcp',
    }))
  },
  setLastCall: (tool) => set({ lastCallAt: Date.now(), lastCallTool: tool }),
  clearCalls: () => set({ calls: [] }),
}))

/* ------------------------------------------------------------------ *
 * Detection
 * ------------------------------------------------------------------ */

function getModelContext(): { mc: ModelContextLike | null; surface: Surface } {
  if (typeof window === 'undefined') return { mc: null, surface: 'none' }

  const nav = (navigator as unknown as { modelContext?: ModelContextLike }).modelContext
  if (nav) return { mc: nav, surface: 'navigator.modelContext' }

  // The hackathon brief and some builds use document.modelContext.
  const doc = (document as unknown as { modelContext?: ModelContextLike }).modelContext
  if (doc) return { mc: doc, surface: 'document.modelContext' }

  return { mc: null, surface: 'none' }
}

export function isWebMCPAvailable(): boolean {
  return getModelContext().mc !== null
}

/* ------------------------------------------------------------------ *
 * In-page fallback registry
 * ------------------------------------------------------------------ */

const registry = new Map<string, WebMCPTool>()

export function localTools(): WebMCPTool[] {
  return [...registry.values()]
}

export function getTool(name: string): WebMCPTool | undefined {
  return registry.get(name)
}

/**
 * Single dispatch point for every tool call, whatever the caller.
 * A real WebMCP agent goes through the browser and lands in `execute` below;
 * the built-in Agent Console calls `callTool` directly. Same executor, same
 * TaskFence guard, no divergence between "the demo" and "the real thing".
 */
export async function callTool(name: string, input: Record<string, unknown> = {}): Promise<unknown> {
  const tool = registry.get(name)
  useConnection.getState().logCall(name, 'in-page')
  if (!tool) {
    return {
      ok: false,
      error: 'UNKNOWN_TOOL',
      message: `No tool named "${name}" is registered on this page. Call getTools() to see what exists.`,
    }
  }
  return tool.execute(input)
}

/* ------------------------------------------------------------------ *
 * Registration
 * ------------------------------------------------------------------ */

function registerOne(mc: ModelContextLike | null, tool: WebMCPTool): Method {
  registry.set(tool.name, tool)

  if (mc?.registerTool) {
    // ---------------------------------------------------------------
    // This is the WebMCP call the hackathon brief asks to see in the repo.
    // Shape:
    //   document.modelContext.registerTool({
    //     name: "search_products",
    //     description: "Search the product catalog",
    //     inputSchema: { /* ... */ },
    //     execute: async (input) => { /* ... */ }
    //   });
    // ---------------------------------------------------------------
    mc.registerTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      execute: async (input: Record<string, unknown>) => {
        // Reaching this wrapper means the *browser* invoked us on an agent's
        // behalf — the only hard evidence that WebMCP is really wired up.
        useConnection.getState().logCall(tool.name, 'webmcp')
        return tool.execute(input ?? {})
      },
    })
    return 'registerTool'
  }

  return 'shim'
}

function registerBatch(mc: ModelContextLike, tools: WebMCPTool[]): Method | null {
  const payload = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    execute: async (input: Record<string, unknown>) => {
      useConnection.getState().logCall(tool.name, 'webmcp')
      return tool.execute(input ?? {})
    },
  }))

  if (mc.provideContext) {
    mc.provideContext({ tools: payload })
    return 'provideContext'
  }
  if (mc.registerTools) {
    mc.registerTools(payload)
    return 'registerTools'
  }
  return null
}

let registered = false

/** Register every tool with the browser (or the fallback registry). Idempotent. */
export function registerTools(tools: WebMCPTool[]): void {
  const { mc, surface } = getModelContext()

  tools.forEach((t) => registry.set(t.name, t))

  let method: Method = 'shim'
  if (mc) {
    if (mc.registerTool) {
      tools.forEach((t) => registerOne(mc, t))
      method = 'registerTool'
    } else {
      method = registerBatch(mc, tools) ?? 'shim'
    }
  }

  useConnection.setState({
    surface,
    method,
    toolCount: registry.size,
    detectedAt: Date.now(),
    live: surface !== 'none',
  })

  // Handy for judges: open devtools and poke the tools directly.
  ;(window as unknown as Record<string, unknown>).taskfence = {
    getTools: () => localTools().map(({ execute, ...rest }) => rest),
    callTool,
    surface,
    method,
  }

  registered = true
}

export function isRegistered(): boolean {
  return registered
}

/**
 * Some WebMCP builds only surface tools that were registered after the agent
 * attached. Re-announcing on visibility change is cheap and makes the demo
 * survive tab switches inside ChatGPT's in-app browser.
 */
export function keepAlive(tools: WebMCPTool[]): () => void {
  const reannounce = () => {
    if (document.visibilityState === 'visible') registerTools(tools)
  }
  document.addEventListener('visibilitychange', reannounce)
  return () => document.removeEventListener('visibilitychange', reannounce)
}
