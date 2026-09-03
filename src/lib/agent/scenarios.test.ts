/**
 * @vitest-environment jsdom
 *
 * The scripted agent's honesty. The bugs these pin: with zero fields it used to
 * announce "every field already has an answer" and then submit an empty record;
 * and with a delegation that flatly forbade submitting, it still walked into
 * the fence instead of saying it would not try.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { formScenario } from './scenarios'
import { customDomain, scholarshipDomain, useRecordStore } from '../domains'
import { useTaskFenceStore } from '../store/taskfenceStore'

function says(steps: ReturnType<typeof formScenario>): string {
  return steps.map((s) => s.say ?? '').join(' ')
}

function calls(steps: ReturnType<typeof formScenario>): string[] {
  return steps.map((s) => s.call?.name).filter(Boolean) as string[]
}

beforeEach(() => {
  useRecordStore('custom').getState().reset()
  useRecordStore('scholarship').getState().reset()
  useTaskFenceStore.getState().resetSession()
})

describe('formScenario on a record with no fields', () => {
  it('says there is nothing to do instead of pretending to finish', () => {
    const steps = formScenario(customDomain)
    expect(says(steps)).toMatch(/no fields yet/i)
    expect(says(steps)).toMatch(/upload the form/i)
  })

  it('never attempts to submit an empty record', () => {
    const steps = formScenario(customDomain)
    expect(calls(steps)).not.toContain('submitRecord')
    expect(calls(steps)).not.toContain('updateRecord')
  })
})

describe('formScenario when the delegation forbids submitting', () => {
  it('stops short instead of walking into the fence', () => {
    useTaskFenceStore
      .getState()
      .startDelegation('Fill my application from my documents. Do not submit anything.', scholarshipDomain)
    const steps = formScenario(scholarshipDomain)
    expect(calls(steps)).not.toContain('submitApplication')
    expect(says(steps)).toMatch(/ruled out submitting/i)
  })

  it('still attempts submission when the rules only ask for approval', () => {
    useTaskFenceStore
      .getState()
      .startDelegation('Fill my application from my documents. Ask before you submit.', scholarshipDomain)
    const steps = formScenario(scholarshipDomain)
    expect(calls(steps)).toContain('submitApplication')
    expect(says(steps)).not.toMatch(/ruled out submitting/i)
  })
})
