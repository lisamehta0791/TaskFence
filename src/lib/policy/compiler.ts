/**
 * Natural-language task intake -> structured Delegation Contract.
 *
 * IMPORTANT — where intelligence is allowed to live:
 *
 *   This compiler runs ONCE, before the task starts, to turn a sentence into a
 *   structured contract. It never decides whether a tool call may run; that is
 *   engine.ts, which is pure rule matching.
 *
 *   Two compilers are supported, and both end at the same place — a contract
 *   the human reads and approves before it becomes active:
 *
 *     1. compileFromText()      — deterministic clause matching, always
 *                                 available, works offline, used by default and
 *                                 as the fallback.
 *     2. proposeContract()      — the connected agent (ChatGPT / Chrome) calls
 *                                 the `proposeDelegationContract` WebMCP tool
 *                                 with a structured proposal. That is the "LLM
 *                                 used once, upfront" path from the design doc,
 *                                 with the LLM being the agent already in the
 *                                 room instead of a hidden API key.
 *
 *   A proposal is never self-activating. It lands in the Ledger as a draft and
 *   waits for a human tap.
 */

import type { DomainSpec } from '../domains/types'
import { makeContract, safetyFloorRules, type RuleInput } from './contract'
import type { DelegationContract, Operation, RuleMatcher, ValueSource } from './types'

export interface CompiledClause {
  /** The exact substring of the human's sentence that produced this rule. */
  phrase: string
  ruleLabel: string
  effect: RuleInput['effect']
}

export interface CompileResult {
  contract: DelegationContract
  clauses: CompiledClause[]
  /** Boundaries we recognised, for the "here is what I understood" panel. */
  understood: string[]
  /** Phrases we did NOT understand — surfaced honestly instead of ignored. */
  unrecognised: string[]
}

export interface CompileContext {
  domain: DomainSpec
  taskId: string
  agentId: string
  sessionId: string
}

interface ClausePattern {
  id: string
  /** Case-insensitive test against the raw sentence. */
  test: RegExp
  build: (domain: DomainSpec) => RuleInput[]
  understood: string
}

/* ------------------------------------------------------------------ *
 * Clause patterns
 * ------------------------------------------------------------------ */

const DONT_CHANGE_EXISTING =
  /(don'?t|do not|never|avoid)\s+(change|modify|edit|overwrite|touch|alter|update|replace)\s+(anything\s+)?(my\s+|the\s+|what\s+i'?ve\s+|what\s+i\s+have\s+)?(existing|already|current|previous)?[^.;]*/i

const ASK_IF_MISSING =
  /(ask|check with|confirm with|tell)\s+me\s+(first\s+)?(if|when|about|whenever|before)[^.;]*(missing|blank|empty|unsure|don'?t know|not sure|unclear)[^.;]*/i

const ASK_IF_MISSING_ALT =
  /(if|when)\s+(something|anything|a field|any field|info(rmation)?)\s+(is\s+)?(missing|blank|empty)[^.;]*(ask|check|confirm)[^.;]*/i

const FILL_FROM_DOCS =
  /(using|from|with|based on)\s+(my|the|these|uploaded)?\s*(documents?|files?|attachments?|transcripts?|records?|papers?)/i

const NO_SUBMIT =
  /(don'?t|do not|never)\s+(submit|send|finalis[ez]|finalize|confirm|pay|purchase|checkout|cancel)[^.;]*/i

const ASK_BEFORE_SUBMIT =
  /(ask|check|confirm|approve|permission)[^.;]*(before|prior to)[^.;]*(submit|send|finalis[ez]|finalize|cancel)[^.;]*/i

/**
 * A blanket "don't change anything" — deliberately NOT matched when the human
 * qualifies it ("don't change anything I've already answered"), which is a much
 * narrower boundary. The negative lookahead is what keeps those two apart.
 */
const NO_WRITES =
  /(don'?t|do not|never)\s+(change|edit|modify|write|touch|update|alter|fill)\s+(in\s+)?anything(?!\s+(i'?ve|i have|that|which|already|existing|i\s))/i

const READ_ONLY =
  /(only\s+)?(read|look at|review|check|summaris[ez]|summarize)[^.;]*(don'?t|do not|without)\s+(chang|edit|writ|modif)/i

const NO_DELETE = /(don'?t|do not|never)\s+(delete|remove|cancel|unsubscribe|terminate)[^.;]*/i

/**
 * An action the human explicitly asked for, on records that already exist
 * ("downgrade them", "pause anything I haven't used"). Without this, a
 * perfectly clear instruction would fall through to the default "changing
 * something that already exists comes back to you" rule and pester the human
 * about the very thing they just asked for.
 *
 * It grants WRITE only. Deletes and anything irreversible still sit behind
 * their own DENY / ASK rules, which outrank an ALLOW.
 */
const EXPLICIT_ACTION =
  /\b(downgrade|upgrade|pause|resume|reduce|switch|move|adjust|trim|rename|reschedule|clean\s?up|tidy)\b/i

function patterns(): ClausePattern[] {
  return [
    {
      id: 'dont-change-existing',
      test: DONT_CHANGE_EXISTING,
      understood: 'Existing answers are off limits.',
      build: (domain) => [
        {
          effect: 'DENY',
          match: {
            tools: domain.writeTools,
            operations: ['WRITE'],
            fields: '*',
            fieldState: 'answered',
          },
          label: 'Change an answer you already gave',
          reason: 'You asked the agent not to change anything you had already answered.',
        },
      ],
    },
    {
      id: 'ask-if-missing',
      test: ASK_IF_MISSING,
      understood: 'If information is missing, the agent must ask you rather than guess.',
      build: (domain) => [askIfMissingRule(domain)],
    },
    {
      id: 'ask-if-missing-alt',
      test: ASK_IF_MISSING_ALT,
      understood: 'If information is missing, the agent must ask you rather than guess.',
      build: (domain) => [askIfMissingRule(domain)],
    },
    {
      id: 'fill-from-docs',
      test: FILL_FROM_DOCS,
      understood: 'The agent may fill blank fields from your uploaded documents.',
      build: (domain) => [
        {
          effect: 'ALLOW',
          match: {
            tools: domain.writeTools,
            operations: ['WRITE'],
            fields: '*',
            fieldState: 'empty',
            sources: ['document'],
          },
          label: 'Fill a blank field from your documents',
          reason: 'You asked the agent to complete the blanks using your documents.',
        },
        {
          effect: 'ALLOW',
          match: { tools: domain.uploadTools, operations: ['UPLOAD'] },
          label: 'Attach your documents',
          reason: 'Attaching the documents you provided is part of the task you delegated.',
        },
      ],
    },
    {
      id: 'no-submit',
      test: NO_SUBMIT,
      understood: 'Nothing may be submitted or finalised.',
      build: (domain) => [
        {
          effect: 'DENY',
          match: { tools: domain.submitTools, operations: ['SUBMIT'] },
          label: 'Submit or finalise',
          reason: 'You told the agent not to submit or finalise anything.',
        },
      ],
    },
    {
      id: 'ask-before-submit',
      test: ASK_BEFORE_SUBMIT,
      understood: 'Submitting needs your explicit approval.',
      build: (domain) => [
        {
          effect: 'ASK',
          match: { tools: domain.submitTools, operations: ['SUBMIT'] },
          label: 'Submit the application',
          reason: 'You asked to approve the final submission yourself.',
        },
      ],
    },
    {
      id: 'read-only',
      test: NO_WRITES,
      understood: 'This is a look-but-do-not-touch task: nothing may be changed.',
      build: () => [readOnlyRule()],
    },
    {
      id: 'read-only-alt',
      test: READ_ONLY,
      understood: 'This is a look-but-do-not-touch task: nothing may be changed.',
      build: () => [readOnlyRule()],
    },
    {
      id: 'explicit-action',
      test: EXPLICIT_ACTION,
      understood: 'The change you asked for is delegated — the agent can just do it.',
      build: (domain) => [
        {
          effect: 'ALLOW',
          match: { tools: domain.writeTools, operations: ['WRITE'] },
          label: 'Make the change you asked for',
          reason: 'You asked for this specific change, so the agent does not have to keep checking back.',
        },
      ],
    },
    {
      id: 'no-delete',
      test: NO_DELETE,
      understood: 'Nothing may be deleted or cancelled.',
      build: (domain) => [
        {
          effect: 'DENY',
          match: { tools: '*', operations: ['DELETE'] },
          label: 'Delete or cancel anything',
          reason: 'You told the agent not to delete or cancel anything.',
        },
      ],
    },
  ]
}

function readOnlyRule(): RuleInput {
  return {
    effect: 'DENY',
    match: { tools: '*', operations: ['WRITE', 'DELETE', 'UPLOAD'] },
    label: 'Change anything at all',
    reason: 'You delegated a read-only task, so nothing on the page may be changed.',
  }
}

function askIfMissingRule(domain: DomainSpec): RuleInput {
  return {
    effect: 'ASK',
    match: {
      tools: domain.writeTools,
      operations: ['WRITE'],
      fields: '*',
      fieldState: 'empty',
      sources: ['inference', 'unknown', 'human'],
    },
    label: 'Fill a blank field the agent had to guess at',
    reason:
      'You asked to be consulted when something is missing, so anything the agent could not read straight from your documents comes to you first.',
  }
}

/* ------------------------------------------------------------------ *
 * Compiler
 * ------------------------------------------------------------------ */

export function compileFromText(statement: string, ctx: CompileContext): CompileResult {
  const { domain } = ctx
  const rules: RuleInput[] = []
  const clauses: CompiledClause[] = []
  const understood: string[] = []

  // Reading is the floor of any delegated task: an agent that cannot look at
  // the page cannot do anything useful, and reading is reversible.
  rules.push({
    effect: 'ALLOW',
    match: { tools: domain.readTools, operations: ['READ'] },
    label: 'Read this page and its requirements',
    reason: 'Reading is always part of a delegated task and never changes anything.',
  })
  understood.push('The agent may read the page.')

  const matchedIds = new Set<string>()
  for (const p of patterns()) {
    const m = statement.match(p.test)
    if (!m) continue
    // ask-if-missing has two spellings; only take the first that hits.
    const family = p.id.replace(/-alt$/, '')
    if (matchedIds.has(family)) continue
    matchedIds.add(family)

    const built = p.build(domain)
    rules.push(...built)
    built.forEach((r) => clauses.push({ phrase: m[0].trim(), ruleLabel: r.label, effect: r.effect }))
    understood.push(p.understood)
  }

  // Default posture when the human said nothing about writing: allow filling
  // blanks from documents, ask about everything else that writes.
  if (!matchedIds.has('fill-from-docs') && !matchedIds.has('read-only')) {
    rules.push({
      effect: 'ALLOW',
      match: {
        tools: domain.writeTools,
        operations: ['WRITE'],
        fieldState: 'empty',
        sources: ['document'],
      },
      label: 'Fill a blank field from your documents',
      reason: 'Completing blanks is the core of the task you described.',
    })
    rules.push({
      effect: 'ALLOW',
      match: { tools: domain.uploadTools, operations: ['UPLOAD'] },
      label: 'Attach your documents',
      reason: 'Attaching documents is part of completing the task.',
    })
  }

  if (!matchedIds.has('ask-if-missing')) rules.push(askIfMissingRule(domain))

  if (
    !matchedIds.has('dont-change-existing') &&
    !matchedIds.has('read-only') &&
    // If they asked for the change in so many words, don't then pester them
    // about it. An explicit "don't" still outranks this, by tier.
    !matchedIds.has('explicit-action')
  ) {
    // Even with no explicit boundary, overwriting an existing human answer is
    // the classic intent-drift move, so it escalates rather than silently runs.
    rules.push({
      effect: 'ASK',
      match: { tools: domain.writeTools, operations: ['WRITE'], fieldState: 'answered' },
      label: 'Change an answer you already gave',
      reason: 'Overwriting something you filled in yourself always comes back to you first.',
    })
  }

  rules.push(...safetyFloorRules())

  const contract = makeContract({
    taskId: ctx.taskId,
    agentId: ctx.agentId,
    sessionId: ctx.sessionId,
    title: domain.taskTitle,
    statement,
    rules,
    status: 'active',
  })

  return { contract, clauses, understood, unrecognised: findUnrecognised(statement, clauses) }
}

/**
 * Surface boundary-sounding phrases we did not turn into a rule. Showing these
 * is deliberate: a silent misread is exactly the failure mode TaskFence exists
 * to prevent.
 */
function findUnrecognised(statement: string, clauses: CompiledClause[]): string[] {
  const consumed = clauses.map((c) => c.phrase.toLowerCase())
  const sentences = statement
    .split(/[.;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const boundaryish = /(don'?t|do not|never|only|must|always|avoid|without|except|unless|before)/i
  return sentences.filter(
    (s) => boundaryish.test(s) && !consumed.some((c) => c.includes(s.toLowerCase()) || s.toLowerCase().includes(c)),
  )
}

/* ------------------------------------------------------------------ *
 * Agent-proposed contracts (the WebMCP path)
 * ------------------------------------------------------------------ */

export interface ProposedRule {
  effect: 'allow' | 'deny' | 'ask'
  tools?: string[] | '*'
  operations?: Operation[] | '*'
  fields?: string[] | '*'
  fieldState?: 'answered' | 'empty' | 'any'
  sources?: ValueSource[] | '*'
  label: string
  reason?: string
}

export interface ProposedContract {
  statement: string
  rules: ProposedRule[]
}

/**
 * Validate and normalise a structured proposal from the agent. Anything the
 * agent sends that is not in the site's own tool list is dropped — the agent
 * cannot invent capabilities, only describe boundaries over real ones.
 */
export function proposeContract(
  proposal: ProposedContract,
  ctx: CompileContext,
): { contract: DelegationContract; dropped: string[] } {
  const { domain } = ctx
  const known = new Set(domain.allTools)
  const dropped: string[] = []

  const rules: RuleInput[] = []
  for (const r of proposal.rules ?? []) {
    const effect = (r.effect ?? 'ask').toUpperCase() as RuleInput['effect']
    if (!['ALLOW', 'DENY', 'ASK'].includes(effect)) {
      dropped.push(`${r.label} (unknown effect "${r.effect}")`)
      continue
    }
    let tools: RuleMatcher['tools'] = '*'
    if (Array.isArray(r.tools)) {
      const valid = r.tools.filter((t) => known.has(t))
      const invalid = r.tools.filter((t) => !known.has(t))
      invalid.forEach((t) => dropped.push(`${r.label} referenced unknown tool "${t}"`))
      if (valid.length === 0) continue
      tools = valid
    }
    rules.push({
      effect,
      match: {
        tools,
        operations: Array.isArray(r.operations) ? r.operations : '*',
        fields: Array.isArray(r.fields) ? r.fields : '*',
        fieldState: r.fieldState ?? 'any',
        sources: Array.isArray(r.sources) ? r.sources : '*',
      },
      label: r.label,
      reason: r.reason ?? `Proposed by the agent from: "${proposal.statement}"`,
      origin: 'initial',
    })
  }

  rules.push(...safetyFloorRules())

  const contract = makeContract({
    taskId: ctx.taskId,
    agentId: ctx.agentId,
    sessionId: ctx.sessionId,
    title: domain.taskTitle,
    statement: proposal.statement,
    rules,
    // Drafts wait for a human tap. An agent cannot authorise itself.
    status: 'draft',
  })

  return { contract, dropped }
}
