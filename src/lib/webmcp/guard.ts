/**
 * The enforcement point.
 *
 * Every WebMCP tool on this site is wrapped in `guarded()`. There is no path
 * from an agent to the application data that skips this function — that is the
 * whole architectural claim of TaskFence: the fence sits *at the tool-call
 * boundary*, not beside it.
 */

import type { DomainSpec } from '../domains/types'
import { recordFieldStates } from '../store/recordStore'
import { subscriptionFieldStates } from '../store/subscriptionStore'
import {
  buildRequest,
  decide,
  statusFor,
  useTaskFenceStore,
} from '../store/taskfenceStore'
import { describeRequest } from '../policy/engine'
import type { ToolCallRequest, ValueSource, WorldState } from '../policy/types'

/* ------------------------------------------------------------------ *
 * World state — the site's own truth, never the agent's claim
 * ------------------------------------------------------------------ */

/**
 * Domains that keep their state somewhere other than a record store register a
 * provider here. Everything form-shaped is handled generically, so adding a
 * workspace needs no entry at all.
 */
const worldProviders: Record<string, () => Record<string, 'answered' | 'empty'>> = {
  subscriptions: subscriptionFieldStates,
}

export function worldFor(domain: DomainSpec): WorldState {
  const provider = worldProviders[domain.id]
  return {
    // Always the site's own truth, never what the agent claims.
    fieldStates: provider ? provider() : recordFieldStates(domain.id),
    irreversibleTools: domain.irreversibleTools,
  }
}

/* ------------------------------------------------------------------ *
 * Tool results
 * ------------------------------------------------------------------ */

export interface GuardMeta {
  decision: 'ALLOW' | 'DENY' | 'ASK'
  code: string
  reason: string
  ruleId?: string | null
  contractVersion?: number
}

export type ToolResult<T = unknown> =
  | { ok: true; data: T; taskfence: GuardMeta }
  | {
      ok: false
      blocked: true
      error: string
      /** Plain language the agent is expected to relay to the human verbatim-ish. */
      message: string
      howToProceed: string
      taskfence: GuardMeta
    }

export interface GuardSpec {
  domain: DomainSpec
  tool: string
  args: Record<string, unknown>
  field?: string
  source?: ValueSource
  /** One-line human description used in the ledger and the approval prompt. */
  intent?: string
  /** Human-readable title for the ledger row, e.g. "Read application". */
  title: string
  detail?: string
}

/**
 * Run `execute` only if the current delegation permits it.
 *
 * ASK decisions pause here: the promise does not resolve until the human taps
 * Allow or Refuse (or the approval times out). Because a WebMCP tool call is
 * just an async function, "pause the agent and ask a human" costs nothing more
 * than not resolving yet — which is exactly why the tool-call boundary is the
 * right place to put this.
 */
export async function guarded<T>(
  spec: GuardSpec,
  execute: (args: Record<string, unknown>) => T | Promise<T>,
): Promise<ToolResult<T>> {
  const store = useTaskFenceStore.getState()
  const world = worldFor(spec.domain)
  let finalArgs: Record<string, unknown> = { ...spec.args }
  const request = buildRequest({
    domain: spec.domain,
    tool: spec.tool,
    args: spec.args,
    field: spec.field,
    source: spec.source,
    intent: spec.intent ?? spec.title,
  })

  let decision = decide(spec.domain, request, world)

  const entryId = store.addLedgerEntry({
    agentId: request.agentId,
    taskId: request.taskId,
    sessionId: request.sessionId,
    tool: spec.tool,
    operation: request.operation,
    field: spec.field,
    title: spec.title,
    detail: spec.detail,
    status: statusFor(decision.decision),
    decision: decision.decision,
    code: decision.code,
    reason: decision.reason,
    ruleId: decision.rule?.id ?? null,
  })

  /* ---------------- ASK: hand control back to the human ---------------- */
  if (decision.decision === 'ASK' || decision.decision === 'DENY') {
    // A DENY is worth interrupting the human for — that is the "you drew this
    // line, do you want to cross it?" moment. But with no delegation at all
    // there is nothing to make an exception to, so it fails closed silently
    // and tells the agent to go and get a delegation first.
    const needsHuman =
      decision.code !== 'NO_ACTIVE_DELEGATION' &&
      (decision.decision === 'ASK' || decision.code === 'FORBIDDEN_BY_CONTRACT')

    if (!needsHuman) {
      return refuse(spec, request, decision, entryId)
    }

    const outcome = await store.openApproval(decision, spec.domain)

    if (!outcome.approved) {
      useTaskFenceStore.getState().updateLedgerEntry(entryId, {
        status: 'refused-by-human',
        result: outcome.reason ?? 'You did not allow this.',
      })
      return {
        ok: false,
        blocked: true,
        error: decision.decision === 'DENY' ? 'BLOCKED_BY_DELEGATION' : 'REFUSED_BY_HUMAN',
        message:
          decision.decision === 'DENY'
            ? `${decision.reason} The human was asked and did not grant an exception.`
            : `The human declined "${describeRequest(request)}".`,
        howToProceed:
          'Tell the human, in your own words, what you were trying to do and why it was blocked. ' +
          'Then continue with the rest of the task, or ask them how they would like to proceed. Do not retry this call.',
        taskfence: {
          decision: decision.decision,
          code: decision.code,
          reason: decision.reason,
          ruleId: decision.rule?.id ?? null,
        },
      }
    }

    // The human may have amended the value before allowing it — that is the
    // "negotiate, don't just approve or refuse" step. What runs is what they
    // signed off on, not what the agent originally proposed.
    if (outcome.amendedArgs) {
      finalArgs = { ...finalArgs, ...outcome.amendedArgs }
      request.args = finalArgs
    }

    // Approved: mint the narrowest possible grant, then re-evaluate. The
    // execution below is authorised by the *rule*, not by the click — so the
    // decision that actually runs the tool is still the deterministic engine.
    const ruleId = useTaskFenceStore
      .getState()
      .grantException(spec.domain.id, request, { scope: outcome.scope, uses: outcome.uses })

    decision = decide(spec.domain, request, worldFor(spec.domain))

    useTaskFenceStore.getState().updateLedgerEntry(entryId, {
      status: 'approved-with-exception',
      ruleId,
      detail: outcome.amendedArgs?.value ? `${spec.field ?? spec.tool} → “${outcome.amendedArgs.value}”` : spec.detail,
      reason:
        outcome.scope === 'exact'
          ? 'You granted a one-time exception for exactly this action.'
          : 'You granted a scoped exception for this tool, for this task only.',
    })

    if (decision.decision !== 'ALLOW') {
      // Defensive: should be unreachable. Fail closed, never open.
      return refuse(spec, request, decision, entryId)
    }
  }

  /* ---------------- ALLOW: run it ---------------- */
  const started = performance.now()
  try {
    const data = await execute(finalArgs)
    const durationMs = Math.round(performance.now() - started)
    useTaskFenceStore.getState().consumeRule(spec.domain.id, decision.rule?.id)
    useTaskFenceStore.getState().updateLedgerEntry(entryId, {
      status: decision.rule?.origin === 'exception' ? 'approved-with-exception' : 'allowed',
      decision: 'ALLOW',
      durationMs,
      result: summarise(data),
    })
    return {
      ok: true,
      data,
      taskfence: {
        decision: 'ALLOW',
        code: decision.code,
        reason: decision.reason,
        ruleId: decision.rule?.id ?? null,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useTaskFenceStore.getState().updateLedgerEntry(entryId, { status: 'error', result: message })
    return {
      ok: false,
      blocked: true,
      error: 'TOOL_FAILED',
      message: `The site could not complete ${spec.tool}: ${message}`,
      howToProceed: 'This is a site error, not a permission problem. Report it to the human.',
      taskfence: { decision: 'ALLOW', code: 'TOOL_FAILED', reason: message },
    }
  }
}

function refuse(
  spec: GuardSpec,
  request: ToolCallRequest,
  decision: ReturnType<typeof decide>,
  entryId: string,
): ToolResult<never> {
  useTaskFenceStore.getState().updateLedgerEntry(entryId, {
    status: 'denied',
    result: decision.reason,
  })
  return {
    ok: false,
    blocked: true,
    error: 'BLOCKED_BY_DELEGATION',
    message: decision.agentMessage,
    howToProceed:
      'Explain the boundary to the human in your own words, then carry on with the parts of the task you can do.',
    taskfence: {
      decision: decision.decision,
      code: decision.code,
      reason: decision.reason,
      ruleId: decision.rule?.id ?? null,
    },
  }
}

function summarise(data: unknown): string {
  if (data === undefined || data === null) return 'done'
  if (typeof data === 'string') return data.slice(0, 140)
  if (typeof data === 'object') {
    const keys = Object.keys(data as Record<string, unknown>)
    return keys.length ? `${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '…' : ''}` : 'done'
  }
  return String(data)
}
