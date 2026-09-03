/**
 * TaskFence — core authorization types.
 *
 * Everything in this file is plain data. The Policy Engine (engine.ts) is a pure
 * function over these structures: no network, no LLM, no randomness.
 */

/** What a tool call actually *does*, independent of its name. */
export type Operation = 'READ' | 'WRITE' | 'UPLOAD' | 'SUBMIT' | 'DELETE' | 'META'

/** The three possible outcomes of a policy check. */
export type Decision = 'ALLOW' | 'DENY' | 'ASK'

/**
 * Where the agent claims a value came from.
 * NOTE (honest positioning): `source` is *agent-declared*, exactly like WebMCP's
 * own `readOnlyHint`. It is used only to make ALLOW rules narrower, never to
 * unlock something a DENY rule forbids. The security-critical predicate
 * (`fieldState: answered`) is evaluated against the site's own state, which the
 * agent cannot forge.
 */
export type ValueSource = 'document' | 'human' | 'inference' | 'unknown'

/** Whether the target field already holds a human-provided answer. */
export type FieldState = 'answered' | 'empty' | 'any'

/** A proposed tool call, normalised into policy vocabulary. */
export interface ToolCallRequest {
  /** Registered WebMCP tool name, e.g. "updateApplication". */
  tool: string
  operation: Operation
  /** Target field/resource id, when the tool writes to one. */
  field?: string
  source?: ValueSource
  /** Raw tool arguments, kept for the ledger and for the approval prompt. */
  args: Record<string, unknown>
  /** Human-readable one-liner describing the call, e.g. "Set familyIncome to 42,000". */
  intent?: string
  agentId: string
  taskId: string
  sessionId: string
  timestamp: number
  /** Marks a call the site itself declares irreversible (e.g. final submission). */
  irreversible?: boolean
}

/** Structural matcher. `'*'` means "any". Arrays mean "one of". */
export interface RuleMatcher {
  tools: '*' | string[]
  operations: '*' | Operation[]
  fields?: '*' | string[]
  /** Only match when the target field is in this state. Default: 'any'. */
  fieldState?: FieldState
  sources?: '*' | ValueSource[]
  /** Only match irreversible / reversible calls. Default: undefined = either. */
  irreversible?: boolean
}

export type RuleOrigin =
  | 'initial' // compiled from the human's opening instruction
  | 'exception' // granted live by the human during the task
  | 'default' // TaskFence's built-in safety floor
  | 'revocation' // human explicitly narrowed the delegation mid-task

export interface Rule {
  id: string
  effect: Decision
  match: RuleMatcher
  /** Plain language, shown in the Ledger. Never an error code. */
  label: string
  /** Plain-language justification shown when this rule decides a call. */
  reason: string
  origin: RuleOrigin
  createdAt: number
  /** Remaining uses. `null` = unlimited. Only meaningful for exception grants. */
  uses: number | null
  /** If true, the rule is retired the moment it authorises one execution. */
  expiresAfterUse: boolean
  /** Wall-clock expiry (ms epoch). `null` = expires with the session. */
  expiresAt: number | null
  /** Exceptions are scoped to the agent + task that requested them. */
  agentId?: string
  taskId?: string
  /** Set once the rule has been consumed/retired. */
  retiredAt?: number | null
}

export interface DelegationContract {
  id: string
  version: number
  taskId: string
  agentId: string
  sessionId: string
  title: string
  /** The human's original sentence. Kept verbatim for the export. */
  statement: string
  createdAt: number
  updatedAt: number
  rules: Rule[]
  status: 'draft' | 'active' | 'completed' | 'revoked'
}

/**
 * The site's own truth about the world at decision time.
 * Supplied by the host application, never by the agent.
 */
export interface WorldState {
  /** fieldId -> whether it currently holds an answer. */
  fieldStates: Record<string, 'answered' | 'empty'>
  /** Tool names the site declares irreversible. */
  irreversibleTools: string[]
}

export interface PolicyDecision {
  decision: Decision
  /** The rule that decided. `null` only for the implicit deny-by-default floor. */
  rule: Rule | null
  /** Machine-stable reason code, for tests and logs. */
  code: string
  /** Plain-language explanation for the human (Ledger + approval modal). */
  reason: string
  /** Plain-language explanation handed back to the agent in the tool result. */
  agentMessage: string
  /** Every rule that structurally matched, in precedence order. For "why?" UI. */
  matched: Array<{ ruleId: string; effect: Decision; specificity: number; label: string }>
  request: ToolCallRequest
  evaluatedAt: number
}

export type LedgerStatus =
  | 'allowed'
  | 'denied'
  | 'awaiting-approval'
  | 'approved-with-exception'
  | 'refused-by-human'
  | 'expired'
  | 'error'

export interface LedgerEntry {
  id: string
  at: number
  agentId: string
  taskId: string
  sessionId: string
  tool: string
  operation: Operation
  field?: string
  /** Plain-language line the human reads, e.g. "Read application". */
  title: string
  detail?: string
  status: LedgerStatus
  decision: Decision
  code: string
  reason: string
  ruleId?: string | null
  /** Result summary once the call ran. */
  result?: string
  durationMs?: number
}

export interface ApprovalRequest {
  id: string
  createdAt: number
  request: ToolCallRequest
  decision: PolicyDecision
  /** Plain-language question shown to the human. */
  question: string
  /** What TaskFence will grant if the human says yes. */
  proposedGrant: {
    label: string
    match: RuleMatcher
    uses: number | null
    expiresAfterUse: boolean
  }
  status: 'pending' | 'approved' | 'refused' | 'timed-out'
  resolvedAt?: number
}

export interface AgentIdentity {
  id: string
  name: string
  /** How the agent reached us — honest about the fact that this is *not* verified. */
  channel: 'chatgpt-in-app' | 'chrome-webmcp' | 'simulated' | 'unknown'
  color: string
  description: string
}
