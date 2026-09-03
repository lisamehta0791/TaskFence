/**
 * @vitest-environment jsdom
 *
 * End-to-end test of the enforcement path: a tool call arrives exactly as it
 * would from a WebMCP agent, and has to survive the policy engine, the ledger
 * and the human approval flow before anything is written.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { callTool, registerTools } from './adapter'
import { allTools } from './index'
import { scholarshipDomain } from '../domains/scholarship'
import { useApplicationStore } from '../store/applicationStore'
import { useTaskFenceStore } from '../store/taskfenceStore'

const STATEMENT =
  "Complete my scholarship application using my documents. Don't change anything I've already answered. If something is missing, ask me. Ask before you submit."

/** Answer the next approval prompt as a human would. */
async function respond(outcome: Parameters<ReturnType<typeof useTaskFenceStore.getState>['resolveApproval']>[1]) {
  // Wait for the guard to actually open the prompt.
  for (let i = 0; i < 50; i += 1) {
    const pending = useTaskFenceStore.getState().approvals.find((a) => a.status === 'pending')
    if (pending) {
      useTaskFenceStore.getState().resolveApproval(pending.id, outcome)
      return pending
    }
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('No approval prompt was raised')
}

describe('the enforcement path', () => {
  beforeEach(() => {
    registerTools(allTools)
    useApplicationStore.getState().reset()
    useTaskFenceStore.getState().resetSession()
  })

  it('refuses everything before a delegation exists', async () => {
    const result: any = await callTool('getApplication', {})
    expect(result.ok).toBe(false)
    expect(result.taskfence.code).toBe('NO_ACTIVE_DELEGATION')
  })

  it('runs the whole demo: read, fill, block, negotiate, submit', async () => {
    useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)

    // --- reads go straight through -------------------------------------
    const app: any = await callTool('getApplication', {})
    expect(app.ok).toBe(true)
    expect(app.data.fields.find((f: any) => f.field === 'gpa').status).toBe('blank')

    // --- filling a blank field from a document is delegated -------------
    const fill: any = await callTool('updateApplication', {
      field: 'gpa',
      value: '3.82 / 4.0',
      source: 'document',
      documentId: 'doc_transcript',
    })
    expect(fill.ok).toBe(true)
    expect(useApplicationStore.getState().values.gpa.value).toBe('3.82 / 4.0')
    expect(useApplicationStore.getState().values.gpa.writtenBy).toBe('agent')

    // --- overwriting an existing answer is forbidden --------------------
    const blocked = callTool('updateApplication', {
      field: 'previousUniversity',
      value: 'Northgate State University',
      source: 'document',
    })
    const prompt = await respond({ approved: false })
    expect(prompt.decision.decision).toBe('DENY')
    const blockedResult: any = await blocked
    expect(blockedResult.ok).toBe(false)
    expect(useApplicationStore.getState().values.previousUniversity.value).toBe('Riverside Community College')

    // --- the human can grant a one-time exception, and amend the value --
    const retry = callTool('updateApplication', {
      field: 'previousUniversity',
      value: 'Northgate State University',
      source: 'document',
    })
    await respond({ approved: true, scope: 'exact', uses: 1, amendedArgs: { value: 'Northgate State Univ.' } })
    const retryResult: any = await retry
    expect(retryResult.ok).toBe(true)
    expect(useApplicationStore.getState().values.previousUniversity.value).toBe('Northgate State Univ.')

    // --- and that exception is spent ------------------------------------
    const again = callTool('updateApplication', {
      field: 'previousUniversity',
      value: 'Somewhere Else',
      source: 'document',
    })
    await respond({ approved: false })
    expect(((await again) as any).ok).toBe(false)

    // --- submission is irreversible, so it always asks ------------------
    for (const [field, value] of [
      ['expectedGraduation', 'June 2027'],
      ['familyIncome', '31,400'],
      ['dependents', '5'],
    ] as const) {
      await callTool('updateApplication', { field, value, source: 'document', documentId: 'doc_income' })
    }
    const gap = callTool('updateApplication', { field: 'fundingGap', value: '4,500', source: 'inference' })
    await respond({ approved: true, scope: 'exact', uses: 1 })
    expect(((await gap) as any).ok).toBe(true)

    const submit = callTool('submitApplication', { confirm: true })
    const submitPrompt = await respond({ approved: true, scope: 'exact', uses: 1 })
    expect(submitPrompt.request.operation).toBe('SUBMIT')
    const submitResult: any = await submit
    expect(submitResult.ok).toBe(true)
    expect(useApplicationStore.getState().submitted).toBe(true)

    // --- and it is all in the ledger ------------------------------------
    const ledger = useTaskFenceStore.getState().ledger
    expect(ledger.some((e) => e.status === 'denied' || e.status === 'refused-by-human')).toBe(true)
    expect(ledger.some((e) => e.status === 'approved-with-exception')).toBe(true)
    expect(ledger.filter((e) => e.status === 'allowed').length).toBeGreaterThan(3)
  })

  it('gives the agent a plain-language reason it can relay', async () => {
    useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)
    const call = callTool('updateApplication', { field: 'fullName', value: 'Someone Else', source: 'inference' })
    await respond({ approved: false })
    const result: any = await call
    expect(result.message).toMatch(/already answered|did not grant/i)
    expect(result.howToProceed).toMatch(/own words/i)
  })

  it('lets a cooperative agent ask permission up front', async () => {
    useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)
    const ask = callTool('requestPermission', {
      tool: 'updateApplication',
      field: 'previousUniversity',
      reason: 'Your transcript disagrees with the form.',
    })
    await respond({ approved: true, scope: 'exact', uses: 1 })
    const result: any = await ask
    expect(result.ok).toBe(true)

    const write: any = await callTool('updateApplication', {
      field: 'previousUniversity',
      value: 'Northgate State University',
      source: 'document',
    })
    expect(write.ok).toBe(true)
  })

  it('keeps one agent’s exception invisible to another agent', async () => {
    const store = useTaskFenceStore.getState()
    store.startDelegation(STATEMENT, scholarshipDomain)

    const call = callTool('updateApplication', { field: 'email', value: 'new@example.edu', source: 'document' })
    await respond({ approved: true, scope: 'tool', uses: 3 })
    expect(((await call) as any).ok).toBe(true)

    // Switch agent: the second agent has no delegation at all here.
    useTaskFenceStore.getState().setActiveAgent('agent_research')
    const other: any = await callTool('updateApplication', {
      field: 'email',
      value: 'other@example.edu',
      source: 'document',
    })
    expect(other.ok).toBe(false)
    expect(other.taskfence.code).toBe('NO_ACTIVE_DELEGATION')
  })
})
