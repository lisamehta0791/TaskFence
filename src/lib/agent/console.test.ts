/**
 * @vitest-environment jsdom
 *
 * The built-in agent is a client of the real tools, not a simulation, so what
 * matters here is that a scripted run actually moves the application, narrates
 * a block in plain words, and reports when it has finished.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useAgentConsole, type ScenarioStep } from './console'
import { formScenario, interpret } from './scenarios'
import { registerTools } from '../webmcp/adapter'
import { allTools } from '../webmcp'
import { scholarshipDomain } from '../domains/scholarship'
import { useApplicationStore } from '../store/applicationStore'
import { useTaskFenceStore } from '../store/taskfenceStore'

const STATEMENT =
  "Complete my scholarship application using my documents. Don't change anything I've already answered. If something is missing, ask me."

beforeAll(() => {
  registerTools(allTools)
})

beforeEach(() => {
  useTaskFenceStore.getState().resetSession()
  useApplicationStore.getState().reset()
  useAgentConsole.getState().clear()
})

describe('the agent console', () => {
  it('runs a scripted sequence and reports finishing', async () => {
    useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)

    await useAgentConsole.getState().run([
      { say: 'Reading the form.', call: { name: 'getApplication' } },
      {
        call: {
          name: 'updateApplication',
          input: { field: 'gpa', value: '3.82 / 4.0', source: 'document', documentId: 'doc_transcript' },
        },
      },
    ])

    const s = useAgentConsole.getState()
    expect(s.running).toBe(false)
    expect(s.finishedAt).not.toBeNull()
    expect(s.stopped).toBe(false)
    expect(useApplicationStore.getState().values.gpa.value).toBe('3.82 / 4.0')

    // Every tool call is echoed into the transcript.
    expect(s.messages.some((m) => m.role === 'tool' && m.text.startsWith('getApplication'))).toBe(true)
  })

  it('explains a block in its own words rather than swallowing it', async () => {
    useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)

    // No delegation for this agent on the subscriptions task -> refused outright,
    // which is the "fails closed, and says so" path.
    await useAgentConsole.getState().run([{ call: { name: 'listSubscriptions' } }])

    const blocked = useAgentConsole.getState().messages.find((m) => m.outcome === 'blocked')
    expect(blocked).toBeDefined()
    expect(blocked?.role).toBe('agent')
    expect(blocked?.text).toMatch(/no active TaskFence delegation|ask the human/i)
  })

  it('refuses to do anything before rules exist', async () => {
    await useAgentConsole.getState().run([{ call: { name: 'getApplication' } }])
    expect(useAgentConsole.getState().messages.some((m) => m.outcome === 'blocked')).toBe(true)
    expect(useApplicationStore.getState().values.gpa.value).toBe('')
  })

  it('marks a run the human interrupted as stopped, not finished', () => {
    useAgentConsole.getState().stop()
    const s = useAgentConsole.getState()
    expect(s.stopped).toBe(true)
    expect(s.finishedAt).toBeNull()
    expect(s.messages.at(-1)?.text).toMatch(/stopped the agent/i)
  })
})

describe('the scripted scholarship run', () => {
  it('is built from whatever documents are actually on the page', () => {
    const withSamples = formScenario(scholarshipDomain)
    const readsTranscript = withSamples.some((s: ScenarioStep) => s.call?.input?.documentId === 'doc_transcript')
    expect(readsTranscript).toBe(true)

    // Remove every document; the run must adapt rather than call missing ids.
    const store = useApplicationStore.getState()
    store.documents.forEach((d) => store.removeDocument(d.id))

    const without = formScenario(scholarshipDomain)
    expect(without.some((s: ScenarioStep) => s.call?.name === 'readDocument')).toBe(false)
    expect(without.some((s: ScenarioStep) => (s.say ?? '').match(/nothing i can fill/i))).toBe(true)
  })

  it('always ends by offering the submission for approval', () => {
    const steps = formScenario(scholarshipDomain)
    expect(steps.some((s: ScenarioStep) => s.call?.name === 'submitApplication')).toBe(true)
  })

  it('finds the conflict between a document and an answer the human gave', () => {
    const steps = formScenario(scholarshipDomain)
    const conflict = steps.find((s: ScenarioStep) => s.call?.input?.field === 'previousUniversity')
    expect(conflict).toBeDefined()
    expect(conflict?.say).toMatch(/conflict/i)
  })
})

describe('the free-text box', () => {
  it('maps plain phrases onto real tool calls', () => {
    expect(interpret('read application')?.name).toBe('getApplication')
    expect(interpret('list documents')?.name).toBe('listDocuments')
    expect(interpret('submit')?.name).toBe('submitApplication')
    expect(interpret('why was that blocked?')?.name).toBe('explainLastDecision')
    expect(interpret('set gpa to 3.9')).toEqual({
      name: 'updateApplication',
      input: { field: 'gpa', value: '3.9', source: 'inference' },
    })
  })

  it('returns nothing rather than guessing at unknown input', () => {
    expect(interpret('make me a sandwich')).toBeNull()
    expect(interpret('   ')).toBeNull()
  })
})
