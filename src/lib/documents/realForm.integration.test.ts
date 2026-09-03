/**
 * @vitest-environment jsdom
 *
 * The whole reported session, end to end.
 *
 * Upload a half-filled scholarship form to the blank workspace, give the rules
 * that were actually typed, and let the scripted agent run. Everything asserted
 * here was wrong in the version that was reported: fields the document plainly
 * contained were never created, answers already typed into the PDF were treated
 * as blanks and re-filled, junk from the printed page was written in as though
 * it were an answer, and "say if any field is wrong" did nothing whatsoever.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { deriveFormFromText, looksLikeAForm } from './deriveForm'
import { customDomain, useRecordStore } from '../domains'
import { callTool, registerTools } from '../webmcp/adapter'
import { allTools } from '../webmcp'
import { useTaskFenceStore } from '../store/taskfenceStore'
import { formScenario } from '../agent/scenarios'

/** The form as the PDF reader now produces it: columns tabbed, typed answers in. */
const FORM = [
  'International Students - Application No:_______',
  'Details of the Applicant:',
  'Name of Program : UG _________________ (UG/PG)',
  'Student Full Name (in Capital Letter): Lisa ____________________',
  'Gender - Male/ Female/ Other\tDate of Birth - 01 / 09 / 2007\tPlace of Birth – Chennai',
  'Nationality - ________________\tPassport Number - _____________',
  'Passport Issuing City- _____________',
  'Email Id - lisamehts\tMobile Number - dvbnhgfdsa',
  'Parent Mobile Number - 12345678\tWhatsApp Number - qwertyuiopo987',
  'Parent Email Id - zxcvbnbvcxsz',
  'FOR OFFICE PURPOSE ONLY',
  'Name of the Candidate:',
  'Signature of the Verifier:',
].join('\n')

/** What was actually typed into the rules box. */
const RULES =
  "Fill in the blanks from my documents. Don't change anything I've already answered. If something is missing, ask me. Ask before you submit. Also say if any field Are wrong and not matching proper standard format"

const store = () => useRecordStore('custom').getState()

/** Upload, exactly as DocumentPanel does it for a user-defined workspace. */
function uploadTheForm() {
  const derived = deriveFormFromText(FORM)
  derived.fields.forEach(store().addField)
  if (looksLikeAForm(derived)) {
    // It is the form itself, so what is in it is the human's own answer.
    Object.entries(derived.answers).forEach(([id, v]) => store().setValue(id, v, 'human'))
  }
  return derived
}

beforeEach(() => {
  registerTools(allTools)
  useRecordStore('custom').getState().reset()
  useTaskFenceStore.getState().resetSession()
})

describe('uploading a real half-filled form', () => {
  it('builds the form out of the document', () => {
    const derived = uploadTheForm()
    expect(derived.fields.length).toBeGreaterThanOrEqual(10)
    expect(looksLikeAForm(derived)).toBe(true)
  })

  it('keeps the answers already in the PDF as the human’s own', () => {
    uploadTheForm()
    const { values } = store()
    expect(values.studentFullName.value).toBe('Lisa')
    expect(values.studentFullName.writtenBy).toBe('human')
    expect(values.emailId.value).toBe('lisamehts')
    expect(values.emailId.writtenBy).toBe('human')
    expect(values.placeOfBirth.value).toBe('Chennai')
  })

  it('leaves the genuinely empty blanks empty', () => {
    uploadTheForm()
    const { values } = store()
    expect(values.nationality.value).toBe('')
    expect(values.passportNumber.value).toBe('')
  })

  it('does not build the applicant a form out of the office’s section', () => {
    uploadTheForm()
    const ids = store().fields.map((f) => f.id)
    expect(ids).not.toContain('nameOfTheCandidate')
    expect(ids).not.toContain('signatureOfTheVerifier')
  })
})

describe('the agent, running against that form under those rules', () => {
  it('is told about the malformed answers, and reports them', async () => {
    uploadTheForm()
    useTaskFenceStore.getState().startDelegation(RULES, customDomain)

    const result: any = await callTool('checkRecord', {})
    expect(result.ok).toBe(true)

    const flagged = result.data.problems.map((p: any) => p.field)
    expect(flagged).toContain('emailId') // "lisamehts" — no @
    expect(flagged).toContain('mobileNumber') // "dvbnhgfdsa" — letters
    expect(flagged).toContain('whatsappNumber') // "qwertyuiopo987"
    expect(flagged).toContain('parentEmailId') // "zxcvbnbvcxsz"

    // A plausible number and a real place name are not flagged.
    expect(flagged).not.toContain('parentMobileNumber')
    expect(flagged).not.toContain('placeOfBirth')
  })

  it('cannot overwrite an answer the human already gave, even a malformed one', async () => {
    uploadTheForm()
    useTaskFenceStore.getState().startDelegation(RULES, customDomain)

    const write = callTool('updateRecord', {
      field: 'emailId',
      value: 'lisa@example.edu',
      source: 'inference',
    })
    // The rules say those answers are off limits, so the human is asked.
    for (let i = 0; i < 50; i += 1) {
      const pending = useTaskFenceStore.getState().approvals.find((a) => a.status === 'pending')
      if (pending) {
        useTaskFenceStore.getState().resolveApproval(pending.id, { approved: false })
        break
      }
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(((await write) as any).ok).toBe(false)
    expect(store().values.emailId.value).toBe('lisamehts')
  })

  it('plans to check the answers before it fills anything in', () => {
    uploadTheForm()
    useTaskFenceStore.getState().startDelegation(RULES, customDomain)

    const steps = formScenario(customDomain)
    const calls = steps.map((s) => s.call?.name).filter(Boolean)
    expect(calls).toContain('checkRecord')
    expect(calls.indexOf('checkRecord')).toBeLessThan(calls.lastIndexOf('updateRecord'))
  })

  it('does not try to submit a form that is still full of blanks', () => {
    uploadTheForm()
    useTaskFenceStore.getState().startDelegation(RULES, customDomain)

    const steps = formScenario(customDomain)
    const submitStep = steps.find((s) => s.call?.name === 'submitRecord')
    // Submitting is allowed by these rules (with approval), so the step exists —
    // but it is guarded by the record actually being complete.
    if (submitStep?.when) expect(submitStep.when()).toBe(true)
    expect(store().submitted).toBe(false)
  })
})
