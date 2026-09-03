/**
 * TaskFence's own agent-facing tools.
 *
 * These are how a *cooperative* agent talks to the fence instead of bumping
 * into it: read the delegation, propose one, ask for permission before acting,
 * and get a plain-language explanation of a block it can relay to the human.
 *
 * They deliberately touch no application data, so they are not a bypass:
 * the worst an agent can do with them is ask the human a question.
 */

import { scholarshipDomain } from '../../domains/scholarship'
import { subscriptionsDomain } from '../../domains/subscriptions'
import type { DomainSpec } from '../../domains/types'
import { contractSummary, describeMatcher } from '../../policy/contract'
import type { ProposedContract } from '../../policy/compiler'
import { buildRequest, useTaskFenceStore } from '../../store/taskfenceStore'
import type { WebMCPTool } from '../adapter'

const DOMAINS: Record<string, DomainSpec> = {
  scholarship: scholarshipDomain,
  subscriptions: subscriptionsDomain,
}

function resolveDomain(input: Record<string, unknown>): DomainSpec {
  const id = String(input.workspace ?? input.domain ?? 'scholarship')
  return DOMAINS[id] ?? scholarshipDomain
}

const workspaceProp = {
  type: 'string',
  enum: ['scholarship', 'subscriptions'],
  description: 'Which workspace on this site you are working in. Defaults to "scholarship".',
}

export const metaTools: WebMCPTool[] = [
  {
    name: 'getDelegation',
    description:
      'Read the delegation the human has granted for this task: what you may do, what is off limits, and what needs their approval. Call this FIRST, before you touch anything, and follow it exactly.',
    inputSchema: {
      type: 'object',
      properties: { workspace: workspaceProp },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: (input) => {
      const domain = resolveDomain(input)
      const store = useTaskFenceStore.getState()
      const contract = store.contractFor(domain.id)

      if (!contract || contract.status === 'revoked') {
        return {
          ok: true,
          data: {
            active: false,
            message:
              'No delegation is active for this task. Nothing is authorised yet. Ask the human what they want done and what their boundaries are, then call proposeDelegationContract.',
          },
        }
      }

      const s = contractSummary(contract)
      return {
        ok: true,
        data: {
          active: contract.status === 'active',
          status: contract.status,
          task: contract.title,
          humanSaid: contract.statement,
          version: contract.version,
          youMay: s.allowed.map((r) => ({ label: r.label, scope: describeMatcher(r.match) })),
          offLimits: s.forbidden.map((r) => ({ label: r.label, why: r.reason })),
          needsApproval: s.requiresApproval.map((r) => ({ label: r.label, why: r.reason })),
          liveExceptions: s.exceptions
            .filter((r) => !r.retiredAt)
            .map((r) => ({ label: r.label, remainingUses: r.uses })),
          howEnforcementWorks:
            'Every tool call on this site is checked against this delegation before it runs. If a call is off limits you will get ok:false with an explanation — relay it to the human rather than trying a different tool.',
        },
      }
    },
  },

  {
    name: 'proposeDelegationContract',
    description:
      'Turn what the human just asked you to do into a structured set of boundaries, and show it to them for approval. Nothing you propose takes effect until the human accepts it on screen. Use this when no delegation is active yet.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: workspaceProp,
        statement: {
          type: 'string',
          description: "The human's request, in their own words, as close to verbatim as you can.",
        },
        rules: {
          type: 'array',
          description: 'The boundaries you read out of their request.',
          items: {
            type: 'object',
            properties: {
              effect: { type: 'string', enum: ['allow', 'deny', 'ask'] },
              tools: { type: 'array', items: { type: 'string' }, description: 'Tool names this rule covers.' },
              operations: {
                type: 'array',
                items: { type: 'string', enum: ['READ', 'WRITE', 'UPLOAD', 'SUBMIT', 'DELETE'] },
              },
              fields: { type: 'array', items: { type: 'string' } },
              fieldState: { type: 'string', enum: ['answered', 'empty', 'any'] },
              sources: { type: 'array', items: { type: 'string', enum: ['document', 'human', 'inference'] } },
              label: { type: 'string', description: 'Plain language, for the human to read.' },
              reason: { type: 'string' },
            },
            required: ['effect', 'label'],
          },
        },
      },
      required: ['statement', 'rules'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: (input) => {
      const domain = resolveDomain(input)
      const proposal: ProposedContract = {
        statement: String(input.statement ?? ''),
        rules: Array.isArray(input.rules) ? (input.rules as ProposedContract['rules']) : [],
      }
      const draft = useTaskFenceStore.getState().receiveProposal(proposal, domain)
      return {
        ok: true,
        data: {
          status: 'awaiting-human',
          proposed: draft.contract.rules.map((r) => ({ effect: r.effect, label: r.label })),
          dropped: draft.dropped ?? [],
          message:
            'The human can now see your proposed boundaries on screen and must accept them before anything is authorised. Tell them it is waiting, then call getDelegation to check.',
        },
      }
    },
  },

  {
    name: 'requestPermission',
    description:
      'Ask the human for permission BEFORE attempting something you think is outside your delegation. If they agree, TaskFence mints a narrow one-time grant for exactly that action, and your next call will go through. Politer and clearer than triggering a block.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: workspaceProp,
        tool: { type: 'string', description: 'The tool you want to call.' },
        field: { type: 'string', description: 'The field or record you want to act on, if any.' },
        reason: {
          type: 'string',
          description: 'Why you want to do it, in plain language the human will read.',
        },
      },
      required: ['tool', 'reason'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const domain = resolveDomain(input)
      const tool = String(input.tool ?? '')
      const field = input.field ? String(input.field) : undefined
      const reason = String(input.reason ?? '')

      if (!domain.allTools.includes(tool)) {
        return {
          ok: false,
          error: 'UNKNOWN_TOOL',
          message: `"${tool}" is not a tool on this site. Call getTools first.`,
        }
      }

      const store = useTaskFenceStore.getState()
      const request = buildRequest({
        domain,
        tool,
        args: { field, reason },
        field,
        source: 'human',
        intent: `${tool}${field ? `(${field})` : '()'} — ${reason}`,
      })

      const outcome = await store.openApproval(
        {
          decision: 'ASK',
          rule: null,
          code: 'AGENT_REQUESTED_PERMISSION',
          reason,
          agentMessage: reason,
          matched: [],
          request,
          evaluatedAt: Date.now(),
        },
        domain,
      )

      if (!outcome.approved) {
        store.addLedgerEntry({
          agentId: request.agentId,
          taskId: request.taskId,
          sessionId: request.sessionId,
          tool,
          operation: request.operation,
          field,
          title: 'Agent asked permission',
          detail: reason,
          status: 'refused-by-human',
          decision: 'DENY',
          code: 'PERMISSION_REFUSED',
          reason: outcome.reason ?? 'You declined.',
        })
        return {
          ok: false,
          error: 'PERMISSION_REFUSED',
          message: 'The human declined. Do not attempt this action.',
        }
      }

      const ruleId = store.grantException(domain.id, request, { scope: outcome.scope, uses: outcome.uses })
      store.addLedgerEntry({
        agentId: request.agentId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        tool,
        operation: request.operation,
        field,
        title: 'Agent asked permission',
        detail: reason,
        status: 'approved-with-exception',
        decision: 'ALLOW',
        code: 'PERMISSION_GRANTED',
        reason: 'You granted a narrow, one-time exception up front.',
        ruleId,
      })

      return {
        ok: true,
        data: {
          granted: true,
          scope: outcome.scope === 'exact' && field ? `${tool}(${field})` : tool,
          uses: outcome.uses,
          message: 'Granted. Make exactly that one call now — the grant expires as soon as it is used.',
        },
      }
    },
  },

  {
    name: 'explainLastDecision',
    description:
      'Get the plain-language reason for the most recent TaskFence decision on this task, so you can explain to the human why something did or did not happen.',
    inputSchema: {
      type: 'object',
      properties: { workspace: workspaceProp },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: (input) => {
      const domain = resolveDomain(input)
      const store = useTaskFenceStore.getState()
      const key = store.taskKey(domain.id)
      const entries = store.ledger.filter((e) => e.taskId === key)
      const last = entries[entries.length - 1]
      if (!last) {
        return { ok: true, data: { message: 'Nothing has been decided on this task yet.' } }
      }
      return {
        ok: true,
        data: {
          action: last.title,
          field: last.field ?? null,
          outcome: last.status,
          reason: last.reason,
          whatToTellTheHuman:
            last.status === 'denied' || last.status === 'refused-by-human'
              ? `Tell them: "I tried to ${last.title.toLowerCase()}${last.field ? ` (${last.field})` : ''}, but ${last.reason}"`
              : `Tell them: "${last.title}${last.field ? ` — ${last.field}` : ''} is done."`,
        },
      }
    },
  },
]
