/**
 * The real form that broke everything.
 *
 * This is the text layer of a genuine university scholarship PDF — a printed
 * form with dash separators, two and three fields to a line, a choice list, an
 * office-only section at the end, and answers the applicant had already typed
 * into the PDF's own form fields. Tabs mark the column gaps `extract.ts`
 * measured between fragments.
 *
 * Every expectation below is something the old code got wrong on this file.
 */

import { describe, expect, it } from 'vitest'
import { deriveFormFromText } from './deriveForm'

/** Page 1, as the reader now produces it: columns tabbed, typed answers merged. */
const PAGE_ONE = [
  'International Students - Application No:_______',
  'Scholarship Application Form For the Year 2025-26',
  'Select the type of Scholarship for which you are eligible (Any One)',
  'For SAARC and African National',
  'Details of the Applicant:',
  'Name of Program : UG _________________ (UG/PG)',
  'Student Full Name (in Capital Letter): Lisa ____________________',
  'Gender - Male/ Female/ Other\tDate of Birth - 01 / 09 / 2007\tPlace of Birth – Chennai',
  'Nationality - ________________\tPassport Number - _____________',
  'Validity of Passport – from ______to _______\tCitizenship Id - ____________',
  'Passport Issuing City- _____________',
  'Email Id - lisamehts\tMobile Number - dvbnhgfdsa',
  'Parent Mobile Number - 12345678\tWhatsApp Number - qwertyuiopo987',
  'Parent Email Id - zxcvbnbvcxsz',
].join('\n')

const PAGE_THREE = [
  'Declaration',
  'Date:\tSignature of Applicant',
  '***********************************************',
  'FOR OFFICE PURPOSE ONLY',
  'Name of the Candidate:',
  'Documents Checked and Verified by:',
  'Signature of the Verifier:',
  'Remark of the Selection Committee: Approved Not Approved',
].join('\n')

describe('a real printed scholarship form', () => {
  const derived = deriveFormFromText(PAGE_ONE)
  const ids = derived.fields.map((f) => f.id)
  const byId = Object.fromEntries(derived.fields.map((f) => [f.id, f]))

  it('finds the fields that use a dash instead of a colon', () => {
    expect(ids).toContain('nationality')
    expect(ids).toContain('passportNumber')
    expect(ids).toContain('citizenshipId')
    expect(ids).toContain('emailId')
    expect(ids).toContain('mobileNumber')
  })

  it('splits a line that carries three fields side by side', () => {
    expect(ids).toContain('gender')
    expect(ids).toContain('dateOfBirth')
    expect(ids).toContain('placeOfBirth')
  })

  it('keeps the answers already typed into the PDF', () => {
    expect(derived.answers.studentFullName).toBe('Lisa')
    expect(derived.answers.nameOfProgram).toBe('UG')
    expect(derived.answers.dateOfBirth).toBe('01 / 09 / 2007')
    expect(derived.answers.placeOfBirth).toBe('Chennai')
    expect(derived.answers.emailId).toBe('lisamehts')
    expect(derived.answers.mobileNumber).toBe('dvbnhgfdsa')
    expect(derived.answers.parentMobileNumber).toBe('12345678')
    expect(derived.answers.whatsappNumber).toBe('qwertyuiopo987')
  })

  it('does not mistake an empty printed blank for an answer', () => {
    // Every one of these was previously "answered" with leftover page furniture.
    expect(derived.answers.nationality).toBeUndefined()
    expect(derived.answers.passportNumber).toBeUndefined()
    expect(derived.answers.citizenshipId).toBeUndefined()
    expect(derived.answers.validityOfPassport).toBeUndefined()
    expect(derived.answers.internationalStudents).toBeUndefined()
  })

  it('reads a printed choice list as choices, not as an answer', () => {
    expect(derived.answers.gender).toBeUndefined()
    expect(byId.gender.type).toBe('select')
    expect(byId.gender.options).toEqual(['Male', 'Female', 'Other'])
  })

  it('does not turn a section heading into a field', () => {
    expect(ids).not.toContain('detailsOfThe')
    expect(ids).not.toContain('detailsOfTheApplicant')
  })
})

describe('the office-only section', () => {
  const derived = deriveFormFromText(PAGE_THREE)
  const ids = derived.fields.map((f) => f.id)

  it('is not part of the form the applicant fills in', () => {
    expect(ids).not.toContain('nameOfTheCandidate')
    expect(ids).not.toContain('signatureOfTheVerifier')
    expect(ids).not.toContain('remarkOfTheSelectionCommittee')
    expect(ids).not.toContain('by')
  })

  it('does not answer "Date" with the words printed beside it', () => {
    expect(derived.answers.date).toBeUndefined()
  })
})
