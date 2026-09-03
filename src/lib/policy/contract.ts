/**
 * Delegation Contract construction helpers.
 *
 * A contract is just an ordered bag of rules plus provenance. Everything here
 * is data-in / data-out so contracts can be exported, re-imported, diffed and
 * replayed.
 */

import { uid } from '../util/id'
import type {
  DelegationContract,
  Decision,
  Rule,
  RuleMatcher,
  RuleOrigin,
  ToolCallRequest,
} from './types'

export interface RuleInput {
  effect: Decision
  match: RuleMatcher
  label: string
  reason: string
  origin?: RuleOrigin
  uses?: number | null
  expiresAfterUse?: boolean
  expiresAt?: number | null
  agentId?: string
  taskId?: string
  createdAt?: number
}

export function makeRule(input: RuleInput): Rule {
  return {
    id: uid('rule'),
    effect: input.effect,
    match: input.match,
    label: input.label,
    reason: input.reason,
    origin: input.origin ?? 'initial',
    createdAt: input.createdAt ?? Date.now(),
    uses: input.uses ?? null,
    expiresAfterUse: input.expiresAfterUse ?? false,
    expiresAt: input.expiresAt ?? null,
    agentId: input.agentId,
    taskId: input.taskId,
    retiredAt: null,
  }
}

export interface ContractInput {
  taskId: string
  agentId: string
  sessionId: string
  title: string
  statement: string
  rules: RuleInput[]
  status?: DelegationContract['status']
}

export function makeContract(input: ContractInput): DelegationContract {
  const now = Date.now()
  return {
    id: uid('contract'),
    version: 1,
    taskId: input.taskId,
    agentId: input.agentId,
    sessionId: input.sessionId,
    title: input.title,
    statement: input.statement,
    createdAt: now,
    updatedAt: now,
    rules: input.rules.map((r) => makeRule({ ...r, createdAt: now })),
    status: input.status ?? 'active',
  }
}

/**
 * TaskFence's built-in safety floor. These are added to every contract and are
 * NOT derived from the human's sentence — they exist so that an agent can never
 * quietly perform an irreversible action just because the compiler missed a
 * phrase.
 */
export function safetyFloorRules(): RuleInput[] {
  return [
    {
      effect: 'ASK',
      match: { tools: '*', operations: ['SUBMIT', 'DELETE'], irreversible: true },
      label: 'Anything final or irreversible',
      reason:
        'This action cannot be undone, so TaskFence always checks with you first — even if the task description did not mention it.',
      origin: 'default',
    },
  ]
}

/* ------------------------------------------------------------------ *
 * Exception grants
 * ------------------------------------------------------------------ */

export interface ExceptionOptions {
  /** How many times the grant may be used. Default 1. */
  uses?: number | null
  /** Widen from "this exact field" to "this tool + operation". Default false. */
  scope?: 'exact' | 'tool'
  /** Optional wall-clock lifetime in ms. */
  ttlMs?: number | null
}

/**
 * Turn a human "yes" into the narrowest rule that authorises exactly the call
 * they just looked at — never a standing, general permission.
 */
export function exceptionFromRequest(req: ToolCallRequest, options: ExceptionOptions = {}): RuleInput {
  const scope = options.scope ?? 'exact'
  const uses = options.uses === undefined ? 1 : options.uses
  const exact = scope === 'exact' && req.field

  const match: RuleMatcher = {
    tools: [req.tool],
    operations: [req.operation],
    fields: exact ? [req.field as string] : '*',
  }

  const label = exact
    ? `${req.tool}(${req.field}) — one-time`
    : `${req.tool} — ${uses === null ? 'for this task' : `${uses}×`}`

  return {
    effect: 'ALLOW',
    match,
    label,
    reason: exact
      ? `You approved this specific change to "${req.field}" once. Nothing else was unlocked.`
      : `You approved ${req.tool} for this task.`,
    origin: 'exception',
    uses,
    expiresAfterUse: uses === 1,
    expiresAt: options.ttlMs ? Date.now() + options.ttlMs : null,
    agentId: req.agentId,
    taskId: req.taskId,
  }
}

/* ------------------------------------------------------------------ *
 * Human-readable rendering (used by the Ledger and the export)
 * ------------------------------------------------------------------ */

export function describeMatcher(m: RuleMatcher): string {
  const parts: string[] = []
  parts.push(m.operations === '*' ? 'any action' : m.operations.join(' / ').toLowerCase())
  parts.push(m.tools === '*' ? 'on any tool' : `via ${m.tools.join(', ')}`)
  if (m.fields && m.fields !== '*') parts.push(`on ${m.fields.join(', ')}`)
  if (m.fieldState && m.fieldState !== 'any') {
    parts.push(m.fieldState === 'answered' ? 'that you already answered' : 'that are still empty')
  }
  if (m.sources && m.sources !== '*') parts.push(`when the value comes from ${m.sources.join(' or ')}`)
  if (m.irreversible) parts.push('and cannot be undone')
  return parts.join(' ')
}

export function contractSummary(contract: DelegationContract) {
  const live = contract.rules.filter((r) => !r.retiredAt)
  return {
    allowed: live.filter((r) => r.effect === 'ALLOW' && r.origin !== 'exception'),
    forbidden: live.filter((r) => r.effect === 'DENY'),
    requiresApproval: live.filter((r) => r.effect === 'ASK'),
    exceptions: contract.rules.filter((r) => r.origin === 'exception'),
  }
}
