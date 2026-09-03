/**
 * @vitest-environment jsdom
 *
 * Pins the exact bug that was reported: `getDelegation` and friends used to
 * fall back to the scholarship domain for any workspace they didn't
 * recognise — which meant asking about the job or custom workspace silently
 * answered with the wrong workspace's rules. `meta.ts` now resolves against
 * the live domain registry instead of a hardcoded two-entry map.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { callTool, registerTools } from './adapter'
import { allTools } from './index'
import { ALL_DOMAINS, jobApplicationDomain, useRecordStore } from '../domains'
import { useTaskFenceStore } from '../store/taskfenceStore'

beforeEach(() => {
  registerTools(allTools)
  useTaskFenceStore.getState().resetSession()
  ALL_DOMAINS.forEach((d) => {
    try {
      useRecordStore(d.id).getState().reset()
    } catch {
      /* subscriptions has no record store */
    }
  })
})

describe('meta tools resolve every real workspace, not just two', () => {
  it('lists every workspace this site actually has', async () => {
    const result: any = await callTool('listWorkspaces', {})
    const ids = result.data.workspaces.map((w: any) => w.workspace)
    expect(ids).toEqual(expect.arrayContaining(ALL_DOMAINS.map((d) => d.id)))
  })

  it('answers getDelegation for the job workspace with the JOB rules, not scholarship\'s', async () => {
    useTaskFenceStore.getState().setActiveAgent('agent_chatgpt')
    useTaskFenceStore
      .getState()
      .startDelegation("Fill in this job application from my CV. Don't change my salary.", jobApplicationDomain)

    const result: any = await callTool('getDelegation', { workspace: 'job' })
    expect(result.data.workspace).toBe('job')
    expect(result.data.task).toBe(jobApplicationDomain.taskTitle)
  })

  it('answers getDelegation for the custom workspace with ITS rules, not scholarship\'s', async () => {
    useTaskFenceStore.getState().setActiveAgent('agent_chatgpt')
    useTaskFenceStore.getState().startDelegation('Fill in the blanks. Ask if something is missing.', {
      ...ALL_DOMAINS.find((d) => d.id === 'custom')!,
    })

    const result: any = await callTool('getDelegation', { workspace: 'custom' })
    expect(result.data.workspace).toBe('custom')
  })

  it('rejects a tool that does not belong to the named workspace, instead of guessing', async () => {
    const result: any = await callTool('requestPermission', {
      workspace: 'job',
      tool: 'submitApplication', // a scholarship tool name, not a job one
      reason: 'test',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('UNKNOWN_TOOL')
  })
})
