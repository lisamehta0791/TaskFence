/**
 * @vitest-environment jsdom
 *
 * "Is this only for scholarship applications?"
 *
 * This file is the answer, in a form that cannot rot. It asserts that the
 * scholarship is nothing more than one config object among several, that a
 * workspace invented inside this test — one the app has never heard of — gets
 * working WebMCP tools and a working fence with no new code, and that the rule
 * engine reaches the same decisions on it as it does on the demo.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { ALL_DOMAINS, FORM_DOMAINS, customDomain, jobApplicationDomain, scholarshipDomain } from './index'
import { createRecordStore, registerRecordStore, recordFieldStates } from '../store/recordStore'
import { makeFormTools } from '../webmcp/tools/form'
import { compileFromText } from '../policy/compiler'
import { evaluate } from '../policy/engine'
import type { DomainSpec } from './types'
import type { ToolCallRequest, WorldState } from '../policy/types'

const BOUNDARY =
  "Fill in the blanks from my documents. Don't change anything I've already answered. Ask before you submit."

/** A workspace the application does not know about, invented here. */
const invented: DomainSpec = {
  id: 'test_clinic',
  route: '/demo',
  taskTitle: 'Clinic intake',
  subject: 'form',
  readTools: ['getIntake', 'getIntakeRequirements', 'listIntakeDocuments', 'readIntakeDocument', 'checkIntake'],
  writeTools: ['updateIntake'],
  uploadTools: ['attachIntakeDocument'],
  submitTools: ['submitIntake'],
  deleteTools: [],
  allTools: [
    'getIntake',
    'getIntakeRequirements',
    'listIntakeDocuments',
    'readIntakeDocument',
    'attachIntakeDocument',
    'updateIntake',
    'submitIntake',
    'checkIntake',
  ],
  irreversibleTools: ['submitIntake'],
  operationOf: {
    checkIntake: 'READ',
    getIntake: 'READ',
    getIntakeRequirements: 'READ',
    listIntakeDocuments: 'READ',
    readIntakeDocument: 'READ',
    attachIntakeDocument: 'UPLOAD',
    updateIntake: 'WRITE',
    submitIntake: 'SUBMIT',
  },
  fields: [
    { id: 'patientName', label: 'Patient name', type: 'text', group: 'Patient', required: true },
    { id: 'allergies', label: 'Known allergies', type: 'text', group: 'History', required: true },
    { id: 'medication', label: 'Current medication', type: 'text', group: 'History', required: true },
  ],
  exampleStatement: BOUNDARY,
  altStatements: [],
  form: {
    noun: 'intake form',
    title: 'Clinic intake',
    subtitle: 'invented inside a test',
    seed: { patientName: 'Amara Okonjo', allergies: '', medication: '' },
    requirements: [],
    documents: [],
  },
}

const ctx = (domain: DomainSpec) => ({
  domain,
  taskId: `agent_a::${domain.id}`,
  agentId: 'agent_a',
  sessionId: 'session_1',
})

function request(domain: DomainSpec, partial: Partial<ToolCallRequest>): ToolCallRequest {
  return {
    tool: domain.writeTools[0],
    operation: 'WRITE',
    args: {},
    agentId: 'agent_a',
    taskId: `agent_a::${domain.id}`,
    sessionId: 'session_1',
    timestamp: 1_000,
    ...partial,
  }
}

beforeEach(() => {
  const store = createRecordStore(invented)
  registerRecordStore(invented.id, store)
})

describe('the scholarship is not special', () => {
  it('is one workspace among several', () => {
    expect(FORM_DOMAINS.length).toBeGreaterThanOrEqual(3)
    expect(FORM_DOMAINS).toContain(scholarshipDomain)
    expect(FORM_DOMAINS).toContain(jobApplicationDomain)
    expect(FORM_DOMAINS).toContain(customDomain)
  })

  it('gets its tools from the same factory as every other workspace', () => {
    for (const domain of FORM_DOMAINS) {
      const tools = makeFormTools(domain)
      expect(tools).toHaveLength(8)
      expect(tools.map((t) => t.name)).toEqual(domain.allTools)
    }
  })

  it('gives every workspace its own tool names, so nothing collides', () => {
    const names = FORM_DOMAINS.flatMap((d) => d.allTools)
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps one workspace that is deliberately not form-shaped', () => {
    const bespoke = ALL_DOMAINS.filter((d) => !d.form)
    expect(bespoke.length).toBeGreaterThan(0)
  })
})

describe('a workspace the app has never heard of', () => {
  it('gets eight working WebMCP tools with no new code', () => {
    const tools = makeFormTools(invented)
    expect(tools.map((t) => t.name)).toEqual(invented.allTools)
    tools.forEach((t) => {
      expect(typeof t.execute).toBe('function')
      expect(t.inputSchema.type).toBe('object')
      expect(t.description.length).toBeGreaterThan(20)
    })
  })

  it('reports its own field states to the fence', () => {
    const states = recordFieldStates(invented.id)
    // Seeded values are the human's answers; blanks are the agent's job.
    expect(states.patientName).toBe('answered')
    expect(states.allergies).toBe('empty')
  })

  it('reaches the same decisions the demo does, from the same sentence', () => {
    const { contract } = compileFromText(BOUNDARY, ctx(invented))
    const world: WorldState = {
      fieldStates: recordFieldStates(invented.id),
      irreversibleTools: invented.irreversibleTools,
    }

    // Blank field, value from a document -> allowed.
    expect(
      evaluate(contract, request(invented, { field: 'allergies', source: 'document' }), world).decision,
    ).toBe('ALLOW')

    // An answer the human wrote -> off limits.
    expect(
      evaluate(contract, request(invented, { field: 'patientName', source: 'document' }), world).decision,
    ).toBe('DENY')

    // Something it guessed at -> comes back to the human.
    expect(
      evaluate(contract, request(invented, { field: 'medication', source: 'inference' }), world).decision,
    ).toBe('ASK')

    // Irreversible -> always asks, whatever the sentence said.
    expect(
      evaluate(
        contract,
        request(invented, { tool: 'submitIntake', operation: 'SUBMIT', irreversible: true }),
        world,
      ).decision,
    ).toBe('ASK')
  })
})

describe('the blank workspace', () => {
  it('starts with no fields, so you define the record yourself', () => {
    expect(customDomain.fields).toHaveLength(0)
    expect(customDomain.form?.userDefined).toBe(true)
  })

  it('accepts fields added at runtime and fences them immediately', () => {
    const store = createRecordStore(customDomain)
    registerRecordStore(customDomain.id, store)

    store.getState().addField({
      id: 'policyNumber',
      label: 'Policy number',
      type: 'text',
      group: 'Details',
      required: true,
    })
    store.getState().setValue('policyNumber', 'PN-4471', 'human')

    const { contract } = compileFromText(BOUNDARY, ctx(customDomain))
    const world: WorldState = {
      fieldStates: recordFieldStates(customDomain.id),
      irreversibleTools: customDomain.irreversibleTools,
    }

    // A field that did not exist a moment ago is protected exactly like any other.
    expect(
      evaluate(contract, request(customDomain, { field: 'policyNumber', source: 'document' }), world).decision,
    ).toBe('DENY')
  })
})
