import { FORM_DOMAINS } from '../domains'
import { keepAlive, registerTools, type WebMCPTool } from './adapter'
import { metaTools } from './tools/meta'
import { makeFormTools } from './tools/form'
import { subscriptionTools } from './tools/subscriptions'

/**
 * Every tool this site hands to an agent.
 *
 * The form workspaces generate theirs from their config — scholarship included,
 * which is the point. Subscriptions keeps hand-written executors because it is
 * not form-shaped, and that contrast is worth having.
 */
export const allTools: WebMCPTool[] = [
  ...metaTools,
  ...FORM_DOMAINS.flatMap((domain) => makeFormTools(domain)),
  ...subscriptionTools,
]

let teardown: (() => void) | null = null

/** Called once from main.tsx, before React renders. */
export function initWebMCP(): void {
  registerTools(allTools)
  teardown?.()
  teardown = keepAlive(allTools)
}

export * from './adapter'
export * from './guard'
