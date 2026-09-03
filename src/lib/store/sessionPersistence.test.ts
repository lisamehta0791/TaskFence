/**
 * @vitest-environment jsdom
 *
 * The "database": localStorage, on the device, and nothing else. What matters
 * is that a refresh keeps your rules and the record, but never restores a
 * paused approval — that holds a promise resolver which cannot survive a
 * reload, and restoring one would leave an agent waiting forever.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { initSessionPersistence, forgetSession } from './sessionPersistence'
import { clearSession, isStorageAvailable, loadSession, saveSession } from './persist'
import { useTaskFenceStore } from './taskfenceStore'
import { useApplicationStore } from './applicationStore'
import { scholarshipDomain } from '../domains/scholarship'

const STATEMENT =
  "Complete my scholarship application using my documents. Don't change anything I've already answered."

beforeEach(() => {
  clearSession()
  useTaskFenceStore.getState().resetSession()
  useApplicationStore.getState().reset()
})

describe('persist', () => {
  it('round-trips a value', () => {
    expect(isStorageAvailable()).toBe(true)
    saveSession({ hello: 'world' })
    expect(loadSession<{ hello: string }>()?.data.hello).toBe('world')
  })

  it('returns null when nothing is stored', () => {
    expect(loadSession()).toBeNull()
  })

  it('discards a snapshot written by an older version', () => {
    window.localStorage.setItem(
      'taskfence.session.v1',
      JSON.stringify({ version: 0, savedAt: Date.now(), data: { stale: true } }),
    )
    expect(loadSession()).toBeNull()
  })

  it('survives unparseable junk', () => {
    window.localStorage.setItem('taskfence.session.v1', 'not json at all')
    expect(loadSession()).toBeNull()
  })
})

describe('session persistence', () => {
  it('restores the rules and the record after a reload', async () => {
    initSessionPersistence()
    useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)
    useApplicationStore.getState().setValue('gpa', '3.9', 'agent')

    // The write is debounced.
    await new Promise((r) => setTimeout(r, 600))

    // Simulate a reload: wipe memory, then boot again.
    useTaskFenceStore.setState({ contracts: {}, ledger: [] })
    useApplicationStore.getState().reset()
    const result = initSessionPersistence()

    expect(result.restored).toBe(true)
    expect(useTaskFenceStore.getState().contractFor('scholarship')?.statement).toBe(STATEMENT)
    expect(useApplicationStore.getState().values.gpa.value).toBe('3.9')
  })

  it('never restores a pending approval', async () => {
    initSessionPersistence()
    useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)
    await new Promise((r) => setTimeout(r, 600))

    initSessionPersistence()
    expect(useTaskFenceStore.getState().approvals).toHaveLength(0)
    expect(useTaskFenceStore.getState().drafts).toEqual({})
  })

  it('forgets everything on request', async () => {
    initSessionPersistence()
    useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)
    await new Promise((r) => setTimeout(r, 600))
    expect(loadSession()).not.toBeNull()

    forgetSession()
    expect(loadSession()).toBeNull()
  })
})
