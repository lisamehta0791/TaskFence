import { describe, expect, it } from 'vitest'
import { matchDocumentToFields } from './matchFields'
import type { FieldSpec } from '../domains/types'

const SCHOLARSHIP_FIELDS: FieldSpec[] = [
  { id: 'fullName', label: 'Full name', type: 'text', group: 'Applicant', required: true },
  { id: 'previousUniversity', label: 'Previous institution', type: 'text', group: 'Education', required: true },
  { id: 'gpa', label: 'Grade average', type: 'text', group: 'Education', required: true },
  { id: 'familyIncome', label: 'Annual household income', type: 'money', group: 'Need', required: true },
]

const JOB_FIELDS: FieldSpec[] = [
  { id: 'currentTitle', label: 'Current job title', type: 'text', group: 'Experience', required: true },
  { id: 'salaryExpectation', label: 'Salary expectation', type: 'money', group: 'Terms', required: true },
  { id: 'noticePeriod', label: 'Notice period', type: 'text', group: 'Terms', required: true },
]

const TRANSCRIPT = `
NORTHGATE STATE UNIVERSITY — OFFICIAL ACADEMIC TRANSCRIPT
Name: Amara Okonjo
Institution: Northgate State University
GPA: 3.82 / 4.0
`

const CV = `
AMARA OKONJO — CURRICULUM VITAE
Location: Bristol, UK
Current job title: Backend Engineer
Salary expectation: 72,000
Notice period: 1 month
`

describe('matchDocumentToFields — generic, not scholarship-hardcoded', () => {
  it('matches a transcript against scholarship fields', () => {
    const matches = matchDocumentToFields(TRANSCRIPT, SCHOLARSHIP_FIELDS)
    const byId = Object.fromEntries(matches.map((m) => [m.fieldId, m]))
    expect(byId.previousUniversity?.value).toBe('Northgate State University')
    expect(byId.gpa?.value).toBe('3.82 / 4.0')
  })

  it('matches a CV against job fields — the same function, a different field list', () => {
    const matches = matchDocumentToFields(CV, JOB_FIELDS)
    const byId = Object.fromEntries(matches.map((m) => [m.fieldId, m]))
    expect(byId.currentTitle?.value).toBe('Backend Engineer')
    expect(byId.salaryExpectation?.value).toBe('72,000')
    expect(byId.noticePeriod?.value).toBe('1 month')
  })

  it('never matches vocabulary the field list does not contain', () => {
    // Location is in the CV but there is no field for it in JOB_FIELDS here.
    const matches = matchDocumentToFields(CV, JOB_FIELDS)
    expect(matches.some((m) => m.value === 'Bristol, UK')).toBe(false)
  })

  it('does not credit an unrelated label to a field with one shared word', () => {
    const matches = matchDocumentToFields('Team name: Kestrel', SCHOLARSHIP_FIELDS)
    expect(matches.find((m) => m.fieldId === 'fullName')).toBeUndefined()
  })

  it('ignores a blank value', () => {
    const matches = matchDocumentToFields('Full name: ______', SCHOLARSHIP_FIELDS)
    expect(matches).toHaveLength(0)
  })

  it('keeps only the best match per field', () => {
    const doc = 'Full name: Amara Okonjo\nApplicant name: Someone Else'
    const matches = matchDocumentToFields(doc, SCHOLARSHIP_FIELDS)
    expect(matches.filter((m) => m.fieldId === 'fullName')).toHaveLength(1)
  })

  it('returns nothing for an empty document or an empty field list', () => {
    expect(matchDocumentToFields('', SCHOLARSHIP_FIELDS)).toHaveLength(0)
    expect(matchDocumentToFields(TRANSCRIPT, [])).toHaveLength(0)
  })

  it('works on fields invented at runtime, not just built-in ones', () => {
    const runtime: FieldSpec[] = [
      { id: 'policyNumber', label: 'Policy number', type: 'text', group: 'Details', required: true },
    ]
    const matches = matchDocumentToFields('Policy number: PN-4471', runtime)
    expect(matches[0]?.value).toBe('PN-4471')
  })
})
