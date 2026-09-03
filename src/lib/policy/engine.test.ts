import { describe, expect, it } from 'vitest'
import { compileFromText } from './compiler'
import { exceptionFromRequest, makeRule } from './contract'
import { consume, evaluate } from './engine'
import { scholarshipDomain } from '../domains/scholarship'
import { subscriptionsDomain } from '../domains/subscriptions'
import type { ToolCallRequest, WorldState } from './types'

const CTX = {
  domain: scholarshipDomain,
  taskId: 'agent_a::scholarship',
  agentId: 'agent_a',
  sessionId: 'session_1',
}

const STATEMENT =
  "Complete my scholarship application using my documents. Don't change anything I've already answered. If something is missing, ask me. Ask before you submit."

const world: WorldState = {
  fieldStates: {
    fullName: 'answered',
    previousUniversity: 'answered',
    gpa: 'empty',
    familyIncome: 'empty',
    fundingGap: 'empty',
  },
  irreversibleTools: ['submitApplication'],
}

function req(partial: Partial<ToolCallRequest>): ToolCallRequest {
  return {
    tool: 'updateApplication',
    operation: 'WRITE',
    args: {},
    agentId: 'agent_a',
    taskId: 'agent_a::scholarship',
    sessionId: 'session_1',
    timestamp: 1_000,
    ...partial,
  }
}

describe('compileFromText', () => {
  it('turns the demo sentence into allow / deny / ask rules', () => {
    const { contract, understood } = compileFromText(STATEMENT, CTX)
    const effects = contract.rules.map((r) => r.effect)
    expect(effects).toContain('ALLOW')
    expect(effects).toContain('DENY')
    expect(effects).toContain('ASK')
    expect(understood.join(' ')).toMatch(/off limits/i)
  })

  it('always adds the irreversible-action safety floor, even when unmentioned', () => {
    const { contract } = compileFromText('Fill in my application from my documents.', CTX)
    const floor = contract.rules.find((r) => r.origin === 'default')
    expect(floor).toBeDefined()
    expect(floor?.effect).toBe('ASK')
  })
})

describe('evaluate', () => {
  const { contract } = compileFromText(STATEMENT, CTX)

  it('allows reading', () => {
    const d = evaluate(contract, req({ tool: 'getApplication', operation: 'READ' }), world)
    expect(d.decision).toBe('ALLOW')
  })

  it('allows filling a blank field from a document', () => {
    const d = evaluate(
      contract,
      req({ field: 'gpa', source: 'document', args: { value: '3.8' } }),
      world,
    )
    expect(d.decision).toBe('ALLOW')
  })

  it('denies overwriting a field the human already answered', () => {
    const d = evaluate(
      contract,
      req({ field: 'previousUniversity', source: 'document', args: { value: 'Northgate' } }),
      world,
    )
    expect(d.decision).toBe('DENY')
    expect(d.code).toBe('FORBIDDEN_BY_CONTRACT')
    expect(d.reason).toMatch(/already answered/i)
  })

  it('asks before writing a value the agent guessed at', () => {
    const d = evaluate(contract, req({ field: 'fundingGap', source: 'inference' }), world)
    expect(d.decision).toBe('ASK')
  })

  it('asks before an irreversible submission', () => {
    const d = evaluate(
      contract,
      req({ tool: 'submitApplication', operation: 'SUBMIT', irreversible: true }),
      world,
    )
    expect(d.decision).toBe('ASK')
  })

  it('asks — never silently allows — for a call nothing covers', () => {
    const d = evaluate(contract, req({ tool: 'someUnknownTool', operation: 'META' }), world)
    expect(d.decision).toBe('ASK')
    expect(d.code).toBe('NOT_DELEGATED')
  })

  it('refuses everything when no delegation is active', () => {
    const d = evaluate(null, req({ tool: 'getApplication', operation: 'READ' }), world)
    expect(d.decision).toBe('ASK')
    expect(d.code).toBe('NO_ACTIVE_DELEGATION')
  })

  it('is deterministic: the same inputs always give the same decision', () => {
    const r = req({ field: 'previousUniversity', source: 'document' })
    const results = Array.from({ length: 25 }, () => evaluate(contract, r, world))
    expect(new Set(results.map((x) => `${x.decision}:${x.code}`)).size).toBe(1)
  })
})

describe('one-time exceptions', () => {
  const { contract } = compileFromText(STATEMENT, CTX)
  const blocked = req({ field: 'previousUniversity', source: 'document', args: { value: 'Northgate' } })

  it('overrides a DENY exactly once, then expires', () => {
    const rule = makeRule(exceptionFromRequest(blocked))
    const withGrant = { ...contract, rules: [...contract.rules, rule] }

    const first = evaluate(withGrant, blocked, world)
    expect(first.decision).toBe('ALLOW')
    expect(first.rule?.origin).toBe('exception')

    const afterUse = { ...withGrant, rules: consume(withGrant.rules, rule.id, 2_000) }
    const second = evaluate(afterUse, blocked, world)
    expect(second.decision).toBe('DENY')
  })

  it('does not widen to other fields', () => {
    const rule = makeRule(exceptionFromRequest(blocked))
    const withGrant = { ...contract, rules: [...contract.rules, rule] }
    const other = req({ field: 'fullName', source: 'document', args: { value: 'X' } })
    expect(evaluate(withGrant, other, world).decision).toBe('DENY')
  })

  it('does not leak to a different agent', () => {
    const rule = makeRule(exceptionFromRequest(blocked))
    const withGrant = { ...contract, rules: [...contract.rules, rule] }
    const otherAgent = { ...blocked, agentId: 'agent_b', taskId: 'agent_b::scholarship' }
    expect(evaluate(withGrant, otherAgent, world).decision).toBe('DENY')
  })

  it('expires on a wall clock', () => {
    const rule = makeRule({ ...exceptionFromRequest(blocked), uses: null, expiresAfterUse: false })
    rule.expiresAt = 1_500
    const withGrant = { ...contract, rules: [...contract.rules, rule] }
    expect(evaluate(withGrant, blocked, world, { now: 1_200 }).decision).toBe('ALLOW')
    expect(evaluate(withGrant, blocked, world, { now: 2_000 }).decision).toBe('DENY')
  })
})

describe('a second, unrelated domain runs on the same engine', () => {
  const SUB_CTX = {
    domain: subscriptionsDomain,
    taskId: 'agent_a::subscriptions',
    agentId: 'agent_a',
    sessionId: 'session_1',
  }
  const subWorld: WorldState = {
    fieldStates: { sub_forge: 'answered', sub_pulse: 'answered' },
    irreversibleTools: ['cancelSubscription'],
  }
  const { contract } = compileFromText(
    "Find subscriptions I haven't used in months and downgrade them. Don't cancel anything without asking me first.",
    SUB_CTX,
  )

  const subReq = (partial: Partial<ToolCallRequest>): ToolCallRequest =>
    req({ taskId: 'agent_a::subscriptions', ...partial })

  it('allows the change the human actually asked for', () => {
    const d = evaluate(
      contract,
      subReq({ tool: 'changePlan', operation: 'WRITE', field: 'sub_forge', source: 'inference' }),
      subWorld,
    )
    expect(d.decision).toBe('ALLOW')
  })

  it('still blocks the irreversible one', () => {
    const d = evaluate(
      contract,
      subReq({ tool: 'cancelSubscription', operation: 'DELETE', field: 'sub_pulse', irreversible: true }),
      subWorld,
    )
    expect(d.decision).toBe('DENY')
  })

  it('does not let "downgrade them" become a licence to overwrite answers elsewhere', () => {
    const strict = compileFromText(
      "Downgrade them, but don't change anything I've already answered.",
      SUB_CTX,
    ).contract
    const d = evaluate(
      strict,
      subReq({ tool: 'changePlan', operation: 'WRITE', field: 'sub_forge', source: 'inference' }),
      subWorld,
    )
    expect(d.decision).toBe('DENY')
  })
})

describe('read-only delegations', () => {
  it('blocks every write when the human asked for a review only', () => {
    const { contract } = compileFromText(
      'Just read my application and tell me what is missing. Do not change anything.',
      CTX,
    )
    expect(evaluate(contract, req({ field: 'gpa', source: 'document' }), world).decision).toBe('DENY')
    expect(
      evaluate(contract, req({ tool: 'getApplication', operation: 'READ' }), world).decision,
    ).toBe('ALLOW')
  })
})
