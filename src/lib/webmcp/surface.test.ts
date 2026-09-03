/**
 * @vitest-environment jsdom
 *
 * The WebMCP surface this site presents to an agent.
 *
 * These assertions exist because the surface is the submission: the tools, their
 * schemas and their annotations are what a judge inspects and what an agent
 * reasons over. A rename or a dropped schema field would be invisible in the UI
 * and fatal to the point of the project.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { allTools, initWebMCP } from './index'
import { localTools, useConnection } from './adapter'
import { scholarshipDomain } from '../domains/scholarship'
import { subscriptionsDomain } from '../domains/subscriptions'

beforeAll(() => {
  initWebMCP()
})

/** The four tools the project document names explicitly. */
const NAMED_IN_BRIEF = ['getApplication', 'uploadDocument', 'updateApplication', 'submitApplication']

const TASKFENCE_TOOLS = [
  'getDelegation',
  'proposeDelegationContract',
  'requestPermission',
  'explainLastDecision',
]

describe('registration', () => {
  it('registers every tool, and reports how', () => {
    const conn = useConnection.getState()
    expect(localTools().length).toBe(allTools.length)
    expect(conn.toolCount).toBe(allTools.length)
    // No WebMCP surface under jsdom, so it must fall back rather than throw.
    expect(conn.method).toBe('shim')
    expect(conn.surface).toBe('none')
  })

  it('exposes a debug handle so anyone can inspect it from the console', () => {
    const handle = (window as unknown as Record<string, any>).taskfence
    expect(typeof handle.callTool).toBe('function')
    expect(handle.getTools()).toHaveLength(allTools.length)
    // The descriptors handed out must not leak the executor.
    expect(handle.getTools()[0]).not.toHaveProperty('execute')
  })
})

describe('the tools named in the project document', () => {
  it.each(NAMED_IN_BRIEF)('registers %s', (name) => {
    expect(allTools.find((t) => t.name === name)).toBeDefined()
  })

  it('registers getRequirements, which the demo walkthrough calls', () => {
    expect(allTools.find((t) => t.name === 'getRequirements')).toBeDefined()
  })

  it('registers the TaskFence tools that let an agent cooperate', () => {
    TASKFENCE_TOOLS.forEach((n) => expect(allTools.find((t) => t.name === n)).toBeDefined())
  })

  it('covers both domains', () => {
    const names = allTools.map((t) => t.name)
    scholarshipDomain.allTools.forEach((n) => expect(names).toContain(n))
    subscriptionsDomain.allTools.forEach((n) => expect(names).toContain(n))
  })
})

describe('every tool is well formed', () => {
  it.each(allTools.map((t) => [t.name, t] as const))('%s', (_name, tool) => {
    expect(tool.description.length).toBeGreaterThan(30)
    expect(tool.inputSchema.type).toBe('object')
    expect(tool.inputSchema).toHaveProperty('properties')
    expect(typeof tool.execute).toBe('function')

    // Anything declared required must actually be described.
    for (const key of tool.inputSchema.required ?? []) {
      expect(Object.keys(tool.inputSchema.properties)).toContain(key)
    }
  })

  it('has no duplicate names', () => {
    const names = allTools.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('annotations', () => {
  it('marks every read-only tool as such', () => {
    const readTools = [...scholarshipDomain.readTools, ...subscriptionsDomain.readTools]
    readTools.forEach((name) => {
      const tool = allTools.find((t) => t.name === name)
      expect(tool?.annotations?.readOnlyHint, `${name} should declare readOnlyHint`).toBe(true)
    })
  })

  it('marks the irreversible tools destructive', () => {
    const irreversible = [...scholarshipDomain.irreversibleTools, ...subscriptionsDomain.irreversibleTools]
    irreversible.forEach((name) => {
      const tool = allTools.find((t) => t.name === name)
      expect(tool?.annotations?.destructiveHint, `${name} should declare destructiveHint`).toBe(true)
    })
  })

  it('flags the tools that hand back user-supplied text as untrusted', () => {
    ;['listDocuments', 'readDocument', 'uploadDocument'].forEach((name) => {
      const tool = allTools.find((t) => t.name === name)
      expect(tool?.annotations?.untrustedContentHint, `${name} should declare untrustedContentHint`).toBe(true)
    })
  })

  it('never marks a writing tool read-only', () => {
    const writers = [
      ...scholarshipDomain.writeTools,
      ...scholarshipDomain.submitTools,
      ...subscriptionsDomain.writeTools,
      ...subscriptionsDomain.deleteTools,
    ]
    writers.forEach((name) => {
      const tool = allTools.find((t) => t.name === name)
      expect(tool?.annotations?.readOnlyHint, `${name} must not claim readOnlyHint`).not.toBe(true)
    })
  })
})

describe('updateApplication carries what the policy engine needs', () => {
  const tool = allTools.find((t) => t.name === 'updateApplication')!

  it('names the field being written, so a rule can be about one field', () => {
    expect(tool.inputSchema.properties).toHaveProperty('field')
    expect(tool.inputSchema.required).toContain('field')
  })

  it('declares where the value came from', () => {
    const source = tool.inputSchema.properties.source as { enum?: string[] }
    expect(source.enum).toEqual(['document', 'human', 'inference'])
  })

  it('tells the agent, in the description, to be honest about the source', () => {
    expect(tool.description).toMatch(/honest/i)
  })
})
