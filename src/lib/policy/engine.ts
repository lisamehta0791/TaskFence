/**
 * TaskFence — Deterministic Policy Engine.
 *
 * This module is the only thing that decides ALLOW / DENY / ASK.
 *
 * Hard design rule:
 *   No LLM, no network call, no randomness, no probability.
 *   evaluate() is a pure function — the same (contract, request, world, now)
 *   always produces exactly the same decision. That is what makes TaskFence
 *   explainable and demoable, rather than "an AI thought it looked fine".
 */

import type {
  Decision,
  DelegationContract,
  PolicyDecision,
  Rule,
  RuleMatcher,
  ToolCallRequest,
  WorldState,
} from './types'

/* ------------------------------------------------------------------ *
 * Matching
 * ------------------------------------------------------------------ */

function listMatches<T extends string>(matcher: '*' | T[] | undefined, value: T | undefined): boolean {
  if (matcher === undefined || matcher === '*') return true
  if (value === undefined) return false
  return matcher.includes(value)
}

/** Does this rule structurally apply to this request, given the world state? */
export function ruleMatches(rule: Rule, req: ToolCallRequest, world: WorldState): boolean {
  const m = rule.match

  if (!listMatches(m.tools, req.tool)) return false
  if (!listMatches(m.operations, req.operation)) return false
  if (!listMatches(m.fields, req.field)) return false
  if (!listMatches(m.sources, req.source ?? 'unknown')) return false

  if (m.irreversible !== undefined) {
    const isIrreversible = req.irreversible ?? world.irreversibleTools.includes(req.tool)
    if (m.irreversible !== isIrreversible) return false
  }

  if (m.fieldState && m.fieldState !== 'any') {
    // A field-state predicate can only be satisfied by a call that names a field.
    if (!req.field) return false
    const state = world.fieldStates[req.field] ?? 'empty'
    if (state !== m.fieldState) return false
  }

  // Exception grants never leak across agents or tasks.
  if (rule.agentId && rule.agentId !== req.agentId) return false
  if (rule.taskId && rule.taskId !== req.taskId) return false

  return true
}

/** A rule is live if it has not been retired, exhausted, or expired. */
export function ruleIsLive(rule: Rule, now: number): boolean {
  if (rule.retiredAt) return false
  if (rule.uses !== null && rule.uses <= 0) return false
  if (rule.expiresAt !== null && rule.expiresAt <= now) return false
  return true
}

/**
 * Specificity — used only to pick the most precise rule *within* one effect
 * class, and to order the "why?" explanation. Higher = narrower.
 */
export function specificity(m: RuleMatcher): number {
  let score = 0
  if (m.tools !== '*') score += 8
  if (m.operations !== '*') score += 4
  if (m.fields && m.fields !== '*') score += 16
  if (m.fieldState && m.fieldState !== 'any') score += 2
  if (m.sources && m.sources !== '*') score += 2
  if (m.irreversible !== undefined) score += 1
  return score
}

/* ------------------------------------------------------------------ *
 * Precedence
 * ------------------------------------------------------------------ */

/**
 * Fixed, documented precedence. Read top to bottom; the first tier that has a
 * matching live rule decides.
 *
 *   1. EXCEPTION grants  — an explicit, narrow, just-made human decision.
 *                          The only thing that can override a DENY, scoped to
 *                          one agent + task, and normally single-use.
 *   2. DENY              — forbidden by the contract ("don't change my answers").
 *   3. ASK               — requires approval ("submitting is final").
 *   4. ALLOW             — explicitly delegated.
 *   5. (nothing matched) — ASK. TaskFence never silently allows an undelegated
 *                          action, and never silently blocks one.
 */
const TIERS: Array<{ effect: Decision; exceptionsOnly?: boolean }> = [
  { effect: 'ALLOW', exceptionsOnly: true },
  { effect: 'DENY' },
  { effect: 'ASK' },
  { effect: 'ALLOW' },
]

function pickBest(rules: Rule[]): Rule {
  return rules.reduce((best, r) => {
    const a = specificity(r.match)
    const b = specificity(best.match)
    if (a !== b) return a > b ? r : best
    // Deterministic tie-break: most recently created wins, then id ordering.
    if (r.createdAt !== best.createdAt) return r.createdAt > best.createdAt ? r : best
    return r.id > best.id ? r : best
  })
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

export interface EvaluateOptions {
  now?: number
}

export function evaluate(
  contract: DelegationContract | null,
  request: ToolCallRequest,
  world: WorldState,
  options: EvaluateOptions = {},
): PolicyDecision {
  const now = options.now ?? request.timestamp

  if (!contract || contract.status === 'revoked') {
    return {
      decision: 'ASK',
      rule: null,
      code: 'NO_ACTIVE_DELEGATION',
      reason:
        'No delegation is active for this task yet, so nothing has been authorised. Describe the task to start one.',
      agentMessage:
        'Blocked: there is no active TaskFence delegation for this session. Ask the human to state the task and its boundaries first, then retry.',
      matched: [],
      request,
      evaluatedAt: now,
    }
  }

  const live = contract.rules.filter((r) => ruleIsLive(r, now))
  const applicable = live.filter((r) => ruleMatches(r, request, world))

  const matched = applicable
    .map((r) => ({ ruleId: r.id, effect: r.effect, specificity: specificity(r.match), label: r.label }))
    .sort((a, b) => b.specificity - a.specificity)

  for (const tier of TIERS) {
    const candidates = applicable.filter((r) => {
      if (r.effect !== tier.effect) return false
      if (tier.exceptionsOnly) return r.origin === 'exception'
      // Exception ALLOWs were already considered in tier 1.
      if (r.effect === 'ALLOW' && r.origin === 'exception') return false
      return true
    })
    if (candidates.length === 0) continue

    const rule = pickBest(candidates)
    return {
      decision: rule.effect,
      rule,
      code: codeFor(rule),
      reason: rule.reason,
      agentMessage: agentMessageFor(rule, request),
      matched,
      request,
      evaluatedAt: now,
    }
  }

  return {
    decision: 'ASK',
    rule: null,
    code: 'NOT_DELEGATED',
    reason: `"${describeRequest(request)}" is not part of what you delegated, so TaskFence paused it and is asking you.`,
    agentMessage:
      `Paused: "${describeRequest(request)}" is outside the current delegation, so TaskFence has asked the human to decide. ` +
      'Do not retry automatically — wait for the result of this call, and explain the pause to the human if it is refused.',
    matched,
    request,
    evaluatedAt: now,
  }
}

function codeFor(rule: Rule): string {
  if (rule.origin === 'exception') return 'ONE_TIME_EXCEPTION'
  if (rule.effect === 'DENY') return 'FORBIDDEN_BY_CONTRACT'
  if (rule.effect === 'ASK') return 'REQUIRES_APPROVAL'
  return 'ALLOWED_BY_CONTRACT'
}

function agentMessageFor(rule: Rule, req: ToolCallRequest): string {
  switch (rule.effect) {
    case 'ALLOW':
      return rule.origin === 'exception'
        ? `Allowed by a one-time exception the human just granted (${rule.label}). That grant is now used up.`
        : 'Allowed by the current delegation.'
    case 'DENY':
      return (
        `Blocked by TaskFence: ${rule.reason} ` +
        'This is a boundary the human set when they delegated the task. Do not try a different tool to achieve the same effect. ' +
        'Explain the block to the human in your own words and ask whether they want to grant a one-time exception.'
      )
    default:
      return (
        `Paused by TaskFence: ${rule.reason} ` +
        `The human has been asked to approve "${describeRequest(req)}". Wait for this call to return.`
      )
  }
}

export function describeRequest(req: ToolCallRequest): string {
  if (req.intent) return req.intent
  if (req.field) return `${req.tool}(${req.field})`
  return `${req.tool}()`
}

/* ------------------------------------------------------------------ *
 * Consumption — the only mutating helper, kept out of evaluate()
 * ------------------------------------------------------------------ */

/**
 * Called *after* a call actually executed under a rule. Returns a new rule list
 * (never mutates in place) with single-use grants decremented / retired.
 */
export function consume(rules: Rule[], ruleId: string | null | undefined, now: number): Rule[] {
  if (!ruleId) return rules
  return rules.map((r) => {
    if (r.id !== ruleId) return r
    if (r.uses === null && !r.expiresAfterUse) return r
    const uses = r.uses === null ? null : Math.max(0, r.uses - 1)
    const exhausted = r.expiresAfterUse || (uses !== null && uses <= 0)
    return { ...r, uses, retiredAt: exhausted ? now : (r.retiredAt ?? null) }
  })
}

/** Expire rules whose wall-clock deadline has passed. Pure. */
export function expireRules(rules: Rule[], now: number): Rule[] {
  return rules.map((r) =>
    !r.retiredAt && r.expiresAt !== null && r.expiresAt <= now ? { ...r, retiredAt: now } : r,
  )
}
