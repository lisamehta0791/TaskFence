import { create } from 'zustand'
import { compileFromText, proposeContract, type CompileResult, type ProposedContract } from '../policy/compiler'
import { consume, describeRequest, evaluate } from '../policy/engine'
import { exceptionFromRequest, makeRule, type ExceptionOptions } from '../policy/contract'
import type {
  AgentIdentity,
  ApprovalRequest,
  DelegationContract,
  LedgerEntry,
  LedgerStatus,
  PolicyDecision,
  ToolCallRequest,
  WorldState,
} from '../policy/types'
import type { DomainSpec } from '../domains/types'
import { uid } from '../util/id'
import { forgetSession } from './persist.reset'

/* ------------------------------------------------------------------ *
 * Simulated agent identities
 *
 * Honest note: WebMCP has no way to cryptographically identify a calling agent
 * (see webmcp issue #105). These identities are declared, not verified — which
 * is exactly why exception grants are scoped to (agent, task) and are one-time.
 * ------------------------------------------------------------------ */

export const AGENTS: AgentIdentity[] = [
  {
    id: 'agent_chatgpt',
    name: 'ChatGPT',
    channel: 'chatgpt-in-app',
    color: '#2BD9C4',
    description: 'The agent in ChatGPT’s in-app browser, calling this site’s WebMCP tools.',
  },
  {
    id: 'agent_chrome',
    name: 'Chrome Agent',
    channel: 'chrome-webmcp',
    color: '#7C6CFF',
    description: 'A browser-side agent using Chrome’s experimental WebMCP surface.',
  },
  {
    id: 'agent_research',
    name: 'Research Assistant',
    channel: 'simulated',
    color: '#F2A93B',
    description: 'A second, separate agent — used to show delegations never leak between agents.',
  },
]

export interface DraftContract extends CompileResult {
  dropped?: string[]
  source: 'human' | 'agent'
}

export type ApprovalOutcome =
  | {
      approved: true
      scope: 'exact' | 'tool'
      uses: number | null
      /** Values the human edited before allowing the call. */
      amendedArgs?: Record<string, unknown>
    }
  | { approved: false; reason?: string }

interface PendingResolver {
  resolve: (outcome: ApprovalOutcome) => void
  timer: number
}

const resolvers = new Map<string, PendingResolver>()

/** How long an approval prompt waits before returning control to the agent. */
export const APPROVAL_TIMEOUT_MS = 120_000

export interface TaskFenceState {
  sessionId: string
  startedAt: number
  activeAgentId: string
  agents: AgentIdentity[]

  /** taskKey -> contract. taskKey is `${agentId}::${domainId}`. */
  contracts: Record<string, DelegationContract>
  drafts: Record<string, DraftContract>
  ledger: LedgerEntry[]
  approvals: ApprovalRequest[]

  /** Replay scrubber position; null = live. */
  replayIndex: number | null

  setActiveAgent: (agentId: string) => void
  taskKey: (domainId: string, agentId?: string) => string
  contractFor: (domainId: string, agentId?: string) => DelegationContract | null

  startDelegation: (statement: string, domain: DomainSpec) => CompileResult
  receiveProposal: (proposal: ProposedContract, domain: DomainSpec) => DraftContract
  activateDraft: (domainId: string) => DelegationContract | null
  discardDraft: (domainId: string) => void
  revokeDelegation: (domainId: string) => void
  completeDelegation: (domainId: string) => void
  narrowDelegation: (domainId: string, ruleId: string) => void

  addLedgerEntry: (entry: Omit<LedgerEntry, 'id' | 'at'> & { at?: number }) => string
  updateLedgerEntry: (id: string, patch: Partial<LedgerEntry>) => void

  openApproval: (decision: PolicyDecision, domain: DomainSpec) => Promise<ApprovalOutcome>
  resolveApproval: (id: string, outcome: ApprovalOutcome) => void

  grantException: (domainId: string, req: ToolCallRequest, options?: ExceptionOptions) => string
  consumeRule: (domainId: string, ruleId: string | null | undefined) => void

  setReplayIndex: (i: number | null) => void
  resetSession: () => void
}

export const useTaskFenceStore = create<TaskFenceState>((set, get) => ({
  sessionId: uid('session'),
  startedAt: Date.now(),
  activeAgentId: AGENTS[0].id,
  agents: AGENTS,

  contracts: {},
  drafts: {},
  ledger: [],
  approvals: [],
  replayIndex: null,

  setActiveAgent: (agentId) => set({ activeAgentId: agentId }),

  taskKey: (domainId, agentId) => `${agentId ?? get().activeAgentId}::${domainId}`,

  contractFor: (domainId, agentId) => get().contracts[get().taskKey(domainId, agentId)] ?? null,

  startDelegation: (statement, domain) => {
    const { activeAgentId, sessionId } = get()
    const key = get().taskKey(domain.id)
    const result = compileFromText(statement, {
      domain,
      taskId: key,
      agentId: activeAgentId,
      sessionId,
    })
    set((s) => ({
      contracts: { ...s.contracts, [key]: result.contract },
      drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => k !== key)),
    }))
    get().addLedgerEntry({
      agentId: activeAgentId,
      taskId: key,
      sessionId,
      tool: 'taskfence',
      operation: 'META',
      title: 'Delegation started',
      detail: statement,
      status: 'allowed',
      decision: 'ALLOW',
      code: 'DELEGATION_CREATED',
      reason: 'You described the task and TaskFence compiled it into a contract.',
    })
    return result
  },

  receiveProposal: (proposal, domain) => {
    const { activeAgentId, sessionId } = get()
    const key = get().taskKey(domain.id)
    const { contract, dropped } = proposeContract(proposal, {
      domain,
      taskId: key,
      agentId: activeAgentId,
      sessionId,
    })
    const draft: DraftContract = {
      contract,
      dropped,
      clauses: [],
      understood: contract.rules.map((r) => r.label),
      unrecognised: [],
      source: 'agent',
    }
    set((s) => ({ drafts: { ...s.drafts, [key]: draft } }))
    get().addLedgerEntry({
      agentId: activeAgentId,
      taskId: key,
      sessionId,
      tool: 'proposeDelegationContract',
      operation: 'META',
      title: 'Agent proposed a delegation',
      detail: proposal.statement,
      status: 'awaiting-approval',
      decision: 'ASK',
      code: 'PROPOSAL_PENDING',
      reason: 'An agent suggested these boundaries. Nothing is authorised until you accept them.',
    })
    return draft
  },

  activateDraft: (domainId) => {
    const key = get().taskKey(domainId)
    const draft = get().drafts[key]
    if (!draft) return null
    const contract: DelegationContract = { ...draft.contract, status: 'active', updatedAt: Date.now() }
    set((s) => ({
      contracts: { ...s.contracts, [key]: contract },
      drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => k !== key)),
    }))
    get().addLedgerEntry({
      agentId: contract.agentId,
      taskId: key,
      sessionId: contract.sessionId,
      tool: 'taskfence',
      operation: 'META',
      title: 'You accepted the delegation',
      detail: contract.statement,
      status: 'allowed',
      decision: 'ALLOW',
      code: 'DELEGATION_ACTIVATED',
      reason: 'You reviewed the proposed boundaries and accepted them.',
    })
    return contract
  },

  discardDraft: (domainId) => {
    const key = get().taskKey(domainId)
    set((s) => ({ drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => k !== key)) }))
  },

  revokeDelegation: (domainId) => {
    const key = get().taskKey(domainId)
    const contract = get().contracts[key]
    if (!contract) return
    set((s) => ({
      contracts: { ...s.contracts, [key]: { ...contract, status: 'revoked', updatedAt: Date.now() } },
    }))
    get().addLedgerEntry({
      agentId: contract.agentId,
      taskId: key,
      sessionId: contract.sessionId,
      tool: 'taskfence',
      operation: 'META',
      title: 'Delegation revoked',
      status: 'denied',
      decision: 'DENY',
      code: 'DELEGATION_REVOKED',
      reason: 'You ended the delegation. The agent has no authority on this task any more.',
    })
  },

  completeDelegation: (domainId) => {
    const key = get().taskKey(domainId)
    const contract = get().contracts[key]
    if (!contract) return
    set((s) => ({
      contracts: { ...s.contracts, [key]: { ...contract, status: 'completed', updatedAt: Date.now() } },
    }))
  },

  narrowDelegation: (domainId, ruleId) => {
    const key = get().taskKey(domainId)
    const contract = get().contracts[key]
    if (!contract) return
    const now = Date.now()
    const rule = contract.rules.find((r) => r.id === ruleId)
    set((s) => ({
      contracts: {
        ...s.contracts,
        [key]: {
          ...contract,
          version: contract.version + 1,
          updatedAt: now,
          rules: contract.rules.map((r) => (r.id === ruleId ? { ...r, retiredAt: now } : r)),
        },
      },
    }))
    if (rule) {
      get().addLedgerEntry({
        agentId: contract.agentId,
        taskId: key,
        sessionId: contract.sessionId,
        tool: 'taskfence',
        operation: 'META',
        title: `Withdrew: ${rule.label}`,
        status: 'denied',
        decision: 'DENY',
        code: 'RULE_WITHDRAWN',
        reason: 'You narrowed the delegation while the task was running.',
      })
    }
  },

  addLedgerEntry: (entry) => {
    const id = uid('ledger')
    const full: LedgerEntry = { id, at: entry.at ?? Date.now(), ...entry } as LedgerEntry
    set((s) => ({ ledger: [...s.ledger, full] }))
    return id
  },

  updateLedgerEntry: (id, patch) =>
    set((s) => ({ ledger: s.ledger.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),

  openApproval: (decision, domain) => {
    const id = uid('approval')
    const req = decision.request
    const isDeny = decision.decision === 'DENY'
    const field = req.field

    const approval: ApprovalRequest = {
      id,
      createdAt: Date.now(),
      request: req,
      decision,
      question: isDeny
        ? `${describeRequest(req)} — you said this was off limits. Allow it just this once?`
        : `${describeRequest(req)} — this needs your approval. Allow it?`,
      proposedGrant: {
        label: field
          ? `${req.tool}(${field}) — once, then it expires`
          : `${req.tool} — once, then it expires`,
        match: { tools: [req.tool], operations: [req.operation], fields: field ? [field] : '*' },
        uses: 1,
        expiresAfterUse: true,
      },
      status: 'pending',
    }

    set((s) => ({ approvals: [...s.approvals, approval] }))

    return new Promise<ApprovalOutcome>((resolve) => {
      const timer = window.setTimeout(() => {
        resolvers.delete(id)
        set((s) => ({
          approvals: s.approvals.map((a) =>
            a.id === id ? { ...a, status: 'timed-out', resolvedAt: Date.now() } : a,
          ),
        }))
        resolve({ approved: false, reason: 'No answer from the human in time.' })
      }, APPROVAL_TIMEOUT_MS)
      resolvers.set(id, { resolve, timer })
      void domain
    })
  },

  resolveApproval: (id, outcome) => {
    const pending = resolvers.get(id)
    if (pending) {
      window.clearTimeout(pending.timer)
      resolvers.delete(id)
      pending.resolve(outcome)
    }
    set((s) => ({
      approvals: s.approvals.map((a) =>
        a.id === id
          ? { ...a, status: outcome.approved ? 'approved' : 'refused', resolvedAt: Date.now() }
          : a,
      ),
    }))
  },

  grantException: (domainId, req, options) => {
    const key = get().taskKey(domainId, req.agentId)
    const contract = get().contracts[key]
    if (!contract) return ''
    const rule = makeRule(exceptionFromRequest(req, options))
    set((s) => ({
      contracts: {
        ...s.contracts,
        [key]: {
          ...contract,
          version: contract.version + 1,
          updatedAt: Date.now(),
          rules: [...contract.rules, rule],
        },
      },
    }))
    return rule.id
  },

  consumeRule: (domainId, ruleId) => {
    const key = get().taskKey(domainId)
    const contract = get().contracts[key]
    if (!contract || !ruleId) return
    set((s) => ({
      contracts: {
        ...s.contracts,
        [key]: { ...contract, rules: consume(contract.rules, ruleId, Date.now()) },
      },
    }))
  },

  setReplayIndex: (i) => set({ replayIndex: i }),

  resetSession: () => {
    resolvers.forEach((r) => window.clearTimeout(r.timer))
    resolvers.clear()
    forgetSession()
    set({
      sessionId: uid('session'),
      startedAt: Date.now(),
      contracts: {},
      drafts: {},
      ledger: [],
      approvals: [],
      replayIndex: null,
    })
  },
}))

/* ------------------------------------------------------------------ *
 * Helpers used by the guard and the UI
 * ------------------------------------------------------------------ */

export function buildRequest(input: {
  domain: DomainSpec
  tool: string
  args: Record<string, unknown>
  field?: string
  source?: ToolCallRequest['source']
  intent?: string
}): ToolCallRequest {
  const s = useTaskFenceStore.getState()
  return {
    tool: input.tool,
    operation: input.domain.operationOf[input.tool] ?? 'META',
    field: input.field,
    source: input.source ?? 'unknown',
    args: input.args,
    intent: input.intent,
    agentId: s.activeAgentId,
    taskId: s.taskKey(input.domain.id),
    sessionId: s.sessionId,
    timestamp: Date.now(),
    irreversible: input.domain.irreversibleTools.includes(input.tool),
  }
}

export function decide(
  domain: DomainSpec,
  request: ToolCallRequest,
  world: WorldState,
): PolicyDecision {
  const contract = useTaskFenceStore.getState().contractFor(domain.id, request.agentId)
  return evaluate(contract, request, world)
}

export function statusFor(decision: PolicyDecision['decision']): LedgerStatus {
  if (decision === 'ALLOW') return 'allowed'
  if (decision === 'DENY') return 'denied'
  return 'awaiting-approval'
}
